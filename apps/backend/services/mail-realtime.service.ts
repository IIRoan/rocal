import { createLogger } from "@workspace/logger";
import { z } from "zod";
import type { MailSyncResult } from "./mail-sync.service";
import { coalescePendingMailSync } from "../lib/inbound-mail-push";
import { errorLogDetails } from "../lib/log-sanitization";
import type { MailAccessTokenProvider } from "../lib/stalwart-user-jmap";

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

type MailboxOwner = {
  userId: string;
  email: string;
};

type MailRealtimeSubscriber = {
  accountIds: Set<string>;
  onEvent: (event: MailChangedEvent) => void;
};

type AccountListener = {
  abortController: AbortController;
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
  private readonly listenersByAccountId = new Map<string, AccountListener>();

  constructor(
    private readonly input: {
      eventSourceUrl: string;
      tokens: MailAccessTokenProvider;
      fetcher?: typeof fetch;
      reconnectDelayMs?: number;
      receiptPollIntervalMs?: number;
      notificationThrottleMs?: number;
      syncProvider?: MailRealtimeSyncProvider;
    },
  ) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.startReceiptPolling();
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
    for (const listener of this.listenersByAccountId.values()) {
      listener.abortController.abort();
    }
    this.listenersByAccountId.clear();
  }

  subscribe(input: {
    subscriberId: string;
    accountIds: string[];
    owner: MailboxOwner;
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
      this.ensureAccountListener(accountId, input.owner);
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
        this.listenersByAccountId.get(accountId)?.abortController.abort();
        this.listenersByAccountId.delete(accountId);
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
        let snapshotChangedTypes = snapshot
          ? resolveChangedTypes(snapshot.changedTypes, fallbackChangedTypes)
          : fallbackChangedTypes;

        if (pending.needsLiveSync && this.input.syncProvider?.syncAccount) {
          const result = await this.input.syncProvider.syncAccount(accountId);
          if (result) {
            snapshot =
              coalescePendingMailSync(pending.sync, result.sync) ?? result.sync;
            snapshotChangedTypes = resolveChangedTypes(
              result.changedTypes,
              fallbackChangedTypes,
            );
          } else if (!snapshot) {
            return;
          }
        }

        if (snapshot) {
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

  /** One EventSource per subscribed account, authorized as that account's owner. */
  private ensureAccountListener(accountId: string, owner: MailboxOwner): void {
    if (this.listenersByAccountId.has(accountId)) {
      return;
    }

    const abortController = new AbortController();
    this.listenersByAccountId.set(accountId, { abortController });
    void this.listenForever(accountId, owner, abortController.signal);
  }

  private async listenForever(
    accountId: string,
    owner: MailboxOwner,
    signal: AbortSignal,
  ): Promise<void> {
    const reconnectDelayMs = this.input.reconnectDelayMs ?? 3000;

    while (!signal.aborted) {
      try {
        logger.info("Connecting to Stalwart JMAP EventSource", { accountId });
        await this.consumeEventSource(accountId, owner, signal);
        if (signal.aborted) {
          break;
        }
        logger.warn(
          "Stalwart JMAP EventSource connection closed; reconnecting.",
          { accountId },
        );
      } catch (error) {
        if (signal.aborted) {
          break;
        }
        logger.error("Stalwart JMAP EventSource listener failed", {
          accountId,
          ...errorLogDetails(error),
        });
      }

      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, reconnectDelayMs);
        signal.addEventListener(
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

  private async consumeEventSource(
    accountId: string,
    owner: MailboxOwner,
    signal: AbortSignal,
  ): Promise<void> {
    const fetcher = this.input.fetcher ?? fetch;
    const url = buildSseRequestUrl(this.input.eventSourceUrl);
    const open = async () => {
      const token = await this.input.tokens.getAccessTokenForUser(owner);
      return fetcher(url, {
        method: "GET",
        signal,
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token.access_token}`,
        },
      });
    };

    let response = await open();
    if (response.status === 401) {
      this.input.tokens.invalidateAccessTokenForUser(owner.userId);
      response = await open();
    }

    if (!response.ok || !response.body) {
      throw new Error(
        `Stalwart EventSource request failed with status ${response.status}.`,
      );
    }

    logger.info("Connected to Stalwart JMAP EventSource", { accountId });

    for await (const frame of parseSseStream(response.body)) {
      if (signal.aborted) {
        return;
      }

      if (frame.event !== "state" || !frame.data) {
        continue;
      }

      const payload = stalwartStateChangeSchema.parse(
        JSON.parse(frame.data),
      ) as StalwartStateChange;

      for (const event of normalizeMailChangedEvents(payload)) {
        logger.info("Received Stalwart mail state change", {
          accountId: event.accountId,
          changedTypes: event.changedTypes,
        });
        this.enqueueEvent(event);
      }
    }
  }
}
