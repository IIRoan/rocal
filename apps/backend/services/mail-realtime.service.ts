import { createLogger } from "@workspace/logger";
import { z } from "zod";
import type { MailSyncResult } from "./mail-sync.service";
import { coalescePendingMailSync } from "../lib/inbound-mail-push";
import { errorLogDetails } from "../lib/log-sanitization";

export type MailChangedEvent = {
  type: "mail.changed";
  accountId: string;
  changedTypes: string[];
  receivedAt: string;
  sync?: MailSyncResult;
};

type StalwartStateChange = {
  "@type"?: string;
  changed?: Record<string, Record<string, string>>;
};

type SseFrame = {
  event?: string;
  id?: string;
  data?: string;
};

const logger = createLogger("backend:mail-realtime");
const WATCHED_TYPES = new Set(["Email", "Mailbox", "Thread"]);
const stalwartStateChangeSchema = z.object({
  "@type": z.string().optional(),
  changed: z.record(z.record(z.string())).optional(),
});

export function resolveChangedTypes(
  syncChangedTypes: string[],
  fallbackChangedTypes: string[],
): string[] {
  return syncChangedTypes.length > 0 ? syncChangedTypes : fallbackChangedTypes;
}

export function normalizeMailChangedEvents(
  payload: StalwartStateChange,
  receivedAt: string = new Date().toISOString(),
): MailChangedEvent[] {
  if (payload["@type"] !== "StateChange" || !payload.changed) {
    return [];
  }

  return Object.entries(payload.changed)
    .map(([accountId, changedTypes]) => {
      const normalizedTypes = Object.keys(changedTypes).filter((type) =>
        WATCHED_TYPES.has(type),
      );

      if (normalizedTypes.length === 0) {
        return null;
      }

      return {
        type: "mail.changed" as const,
        accountId,
        changedTypes: normalizedTypes,
        receivedAt,
      };
    })
    .filter((event): event is MailChangedEvent => event !== null);
}

function buildSseRequestUrl(template: string): string {
  return template
    .replace("{types}", encodeURIComponent("Email,Mailbox,Thread"))
    .replace("{closeafter}", "no")
    .replace("{ping}", "30");
}

async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let frame: SseFrame = {};

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line) {
        if (frame.event || frame.data || frame.id) {
          yield frame;
        }
        frame = {};
        continue;
      }

      if (line.startsWith(":")) {
        continue;
      }

      const separatorIndex = line.indexOf(":");
      const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
      const rawValue =
        separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
      const valueText = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

      if (field === "event") {
        frame.event = valueText;
      } else if (field === "data") {
        frame.data = frame.data ? `${frame.data}\n${valueText}` : valueText;
      } else if (field === "id") {
        frame.id = valueText;
      }
    }
  }

  if (frame.event || frame.data || frame.id) {
    yield frame;
  }
}

type MailRealtimeSubscriber = {
  accountIds: Set<string>;
  onEvent: (event: MailChangedEvent) => void;
};

type MailRealtimeSyncProvider = {
  syncKnownChangedAccounts: () => Promise<
    Array<{
      accountId: string;
      userId?: string;
      changedTypes: string[];
      sync: MailSyncResult;
    }>
  >;
  syncAccount?: (accountId: string) => Promise<
    | {
        accountId: string;
        userId?: string;
        changedTypes: string[];
        sync: MailSyncResult;
      }
    | null
  >;
};

type PendingAccountChange = {
  changedTypes: Set<string>;
  receivedAt: string;
  userId?: string;
  sync?: MailSyncResult;
  needsLiveSync?: boolean;
};

export class MailRealtimeService {
  private readonly subscribers = new Map<string, MailRealtimeSubscriber>();
  private readonly subscribersByAccountId = new Map<string, Set<string>>();
  private readonly pendingByAccountId = new Map<string, PendingAccountChange>();
  private readonly flushTimerByAccountId = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly syncInFlightByAccountId = new Map<string, Promise<void>>();
  private started = false;
  private receiptPollId: ReturnType<typeof setInterval> | null = null;
  private receiptPollRunning = false;
  private listenerAbortController: AbortController | null = null;

  constructor(
    private readonly input: {
      eventSourceUrl: string;
      adminToken: string;
      fetcher?: typeof fetch;
      reconnectDelayMs?: number;
      receiptPollIntervalMs?: number;
      notificationThrottleMs?: number;
      syncProvider?: MailRealtimeSyncProvider;
      onInboundMail?: (input: {
        accountId: string;
        userId?: string;
        sync: MailSyncResult;
      }) => Promise<void> | void;
    },
  ) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.listenerAbortController = new AbortController();
    this.startReceiptPolling();

    if (!this.input.adminToken.trim()) {
      logger.warn(
        "Mail EventSource listener disabled because STALWART_ADMIN_TOKEN is missing; receipt-time JMAP polling remains active.",
      );
      return;
    }

    void this.listenForever();
  }

  stop(): void {
    this.started = false;
    if (this.receiptPollId) {
      clearInterval(this.receiptPollId);
      this.receiptPollId = null;
    }
    for (const timeoutId of this.flushTimerByAccountId.values()) {
      clearTimeout(timeoutId);
    }
    this.flushTimerByAccountId.clear();
    this.pendingByAccountId.clear();
    this.syncInFlightByAccountId.clear();
    this.listenerAbortController?.abort();
    this.listenerAbortController = null;
  }

  subscribe(input: {
    subscriberId: string;
    accountIds: string[];
    onEvent: (event: MailChangedEvent) => void;
  }): () => void {
    this.unsubscribe(input.subscriberId);
    this.subscribers.set(input.subscriberId, {
      accountIds: new Set(input.accountIds),
      onEvent: input.onEvent,
    });
    for (const accountId of input.accountIds) {
      const subscribers = this.subscribersByAccountId.get(accountId) ?? new Set();
      subscribers.add(input.subscriberId);
      this.subscribersByAccountId.set(accountId, subscribers);
    }

    return () => {
      this.unsubscribe(input.subscriberId);
    };
  }

  publish(event: MailChangedEvent): void {
    const subscriberIds = this.subscribersByAccountId.get(event.accountId);

    if (!subscriberIds) {
      return;
    }

    for (const subscriberId of subscriberIds) {
      const subscriber = this.subscribers.get(subscriberId);
      subscriber?.onEvent(event);
    }
  }

  private notifyInboundMail(
    accountId: string,
    sync: MailSyncResult,
    userId?: string,
  ): void {
    if (!this.input.onInboundMail) {
      return;
    }

    const payload = {
      accountId,
      sync,
      ...(userId ? { userId } : {}),
    };

    void (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await this.input.onInboundMail!(payload);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise((resolve) => {
              setTimeout(resolve, 200 * attempt);
            });
          }
        }
      }
      logger.warn("Inbound mail push enqueue failed", {
        accountId,
        ...errorLogDetails(lastError),
      });
    })();
  }

  private unsubscribe(subscriberId: string): void {
    const existing = this.subscribers.get(subscriberId);

    if (!existing) {
      return;
    }

    this.subscribers.delete(subscriberId);
    for (const accountId of existing.accountIds) {
      const subscribers = this.subscribersByAccountId.get(accountId);

      if (!subscribers) {
        continue;
      }

      subscribers.delete(subscriberId);
      if (subscribers.size === 0) {
        this.subscribersByAccountId.delete(accountId);
      }
    }
  }

  private hasSubscribers(accountId: string): boolean {
    return (this.subscribersByAccountId.get(accountId)?.size ?? 0) > 0;
  }

  private enqueueEvent(event: MailChangedEvent, userId?: string): void {
    const pending = this.pendingByAccountId.get(event.accountId) ?? {
      changedTypes: new Set<string>(),
      receivedAt: event.receivedAt,
    };

    for (const type of event.changedTypes) {
      pending.changedTypes.add(type);
    }

    if (event.receivedAt > pending.receivedAt) {
      pending.receivedAt = event.receivedAt;
    }

    if (userId) {
      pending.userId = userId;
    }

    if (!event.sync) {
      pending.needsLiveSync = true;
    }

    pending.sync = coalescePendingMailSync(pending.sync, event.sync);

    this.pendingByAccountId.set(event.accountId, pending);
    this.scheduleFlush(event.accountId);
  }

  private scheduleFlush(accountId: string): void {
    if (
      this.flushTimerByAccountId.has(accountId) ||
      this.syncInFlightByAccountId.has(accountId)
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      this.flushTimerByAccountId.delete(accountId);
      void this.flushAccount(accountId);
    }, this.input.notificationThrottleMs ?? 750);

    this.flushTimerByAccountId.set(accountId, timeoutId);
  }

  private async flushAccount(accountId: string): Promise<void> {
    const pending = this.pendingByAccountId.get(accountId);

    if (!pending || this.syncInFlightByAccountId.has(accountId)) {
      return;
    }

    this.pendingByAccountId.delete(accountId);
    const fallbackChangedTypes = [...pending.changedTypes];
    const fallbackEvent: MailChangedEvent = {
      type: "mail.changed",
      accountId,
      changedTypes: fallbackChangedTypes,
      receivedAt: pending.receivedAt,
    };

    const flushPromise = (async () => {
      try {
        let snapshot = pending.sync;
        let snapshotUserId = pending.userId;
        let snapshotChangedTypes = snapshot
          ? resolveChangedTypes(snapshot.changedTypes, fallbackChangedTypes)
          : fallbackChangedTypes;

        if (pending.needsLiveSync && this.input.syncProvider?.syncAccount) {
          const result = await this.input.syncProvider.syncAccount(accountId);
          if (result) {
            snapshot =
              coalescePendingMailSync(pending.sync, result.sync) ?? result.sync;
            snapshotUserId = result.userId ?? pending.userId;
            snapshotChangedTypes = resolveChangedTypes(
              result.changedTypes,
              fallbackChangedTypes,
            );
          } else if (!snapshot) {
            return;
          }
        }

        if (snapshot) {
          this.notifyInboundMail(accountId, snapshot, snapshotUserId);
          if (this.hasSubscribers(accountId)) {
            this.publish({
              ...fallbackEvent,
              changedTypes: snapshotChangedTypes,
              sync: snapshot,
            });
          }
          return;
        }

        if (!this.input.syncProvider?.syncAccount) {
          if (this.hasSubscribers(accountId)) {
            this.publish(fallbackEvent);
          }
          return;
        }

        const result = await this.input.syncProvider.syncAccount(accountId);

        if (!result) {
          return;
        }

        this.notifyInboundMail(
          accountId,
          result.sync,
          result.userId ?? pending.userId,
        );
        if (this.hasSubscribers(accountId)) {
          this.publish({
            type: "mail.changed",
            accountId,
            changedTypes: resolveChangedTypes(
              result.changedTypes,
              fallbackChangedTypes,
            ),
            receivedAt: pending.receivedAt,
            sync: result.sync,
          });
        }
      } catch (error) {
        logger.warn("Mail realtime flush failed", {
          accountId,
          ...errorLogDetails(error),
        });

        if (this.hasSubscribers(accountId)) {
          this.publish(fallbackEvent);
        }
      } finally {
        this.syncInFlightByAccountId.delete(accountId);

        if (this.pendingByAccountId.has(accountId)) {
          this.scheduleFlush(accountId);
        }
      }
    })();

    this.syncInFlightByAccountId.set(accountId, flushPromise);
    await flushPromise;
  }

  private startReceiptPolling(): void {
    if (!this.input.syncProvider || this.receiptPollId) {
      return;
    }

    const intervalMs = this.input.receiptPollIntervalMs ?? 30_000;
    const poll = () => {
      if (this.receiptPollRunning) {
        return;
      }

      this.receiptPollRunning = true;
      void this.input
        .syncProvider!.syncKnownChangedAccounts()
        .then((results) => {
          const receivedAt = new Date().toISOString();
          for (const result of results) {
            this.enqueueEvent(
              {
                type: "mail.changed",
                accountId: result.accountId,
                changedTypes: resolveChangedTypes(
                  result.sync.changedTypes,
                  result.changedTypes,
                ),
                receivedAt,
                sync: result.sync,
              },
              result.userId,
            );
          }
        })
        .catch((error) => {
          logger.warn("Receipt-time mail polling failed", errorLogDetails(error));
        })
        .finally(() => {
          this.receiptPollRunning = false;
        });
    };

    poll();
    this.receiptPollId = setInterval(poll, intervalMs);
  }

  private async listenForever(): Promise<void> {
    const reconnectDelayMs = this.input.reconnectDelayMs ?? 3000;
    const signal = this.listenerAbortController?.signal;

    while (this.started && !signal?.aborted) {
      try {
        logger.info("Connecting to Stalwart JMAP EventSource");
        await this.consumeEventSource(signal);
        if (!this.started || signal?.aborted) {
          break;
        }
        logger.warn(
          "Stalwart JMAP EventSource connection closed; reconnecting.",
        );
      } catch (error) {
        if (signal?.aborted || !this.started) {
          break;
        }
        logger.error("Stalwart JMAP EventSource listener failed", errorLogDetails(error));
      }

      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, reconnectDelayMs);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timeoutId);
            resolve();
          },
          { once: true },
        );
      });
    }
  }

  private async consumeEventSource(signal?: AbortSignal): Promise<void> {
    const response = await (this.input.fetcher ?? fetch)(
      buildSseRequestUrl(this.input.eventSourceUrl),
      {
        method: "GET",
        signal,
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${this.input.adminToken}`,
        },
      },
    );

    if (!response.ok || !response.body) {
      throw new Error(
        `Stalwart EventSource request failed with status ${response.status}.`,
      );
    }

    logger.info("Connected to Stalwart JMAP EventSource");

    for await (const frame of parseSseStream(response.body)) {
      if (signal?.aborted || !this.started) {
        return;
      }

      if (frame.event !== "state" || !frame.data) {
        continue;
      }

      const payload = stalwartStateChangeSchema.parse(
        JSON.parse(frame.data),
      ) as StalwartStateChange;
      const events = normalizeMailChangedEvents(payload);

      for (const event of events) {
        logger.info("Received Stalwart mail state change", {
          accountId: event.accountId,
          changedTypes: event.changedTypes,
        });
        this.enqueueEvent(event);
      }
    }
  }
}
