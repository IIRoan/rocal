import { createLogger } from "@workspace/logger";
import { z } from "zod";
import type { MailSyncResult } from "./mail-sync.service";

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
      changedTypes: string[];
      sync: MailSyncResult;
    }>
  >;
};

export class MailRealtimeService {
  private readonly subscribers = new Map<string, MailRealtimeSubscriber>();
  private started = false;
  private receiptPollId: ReturnType<typeof setInterval> | null = null;
  private receiptPollRunning = false;

  constructor(
    private readonly input: {
      eventSourceUrl: string;
      adminToken: string;
      fetcher?: typeof fetch;
      reconnectDelayMs?: number;
      receiptPollIntervalMs?: number;
      syncProvider?: MailRealtimeSyncProvider;
    },
  ) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
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
    if (this.receiptPollId) {
      clearInterval(this.receiptPollId);
      this.receiptPollId = null;
    }
    this.started = false;
  }

  subscribe(input: {
    subscriberId: string;
    accountIds: string[];
    onEvent: (event: MailChangedEvent) => void;
  }): () => void {
    this.subscribers.set(input.subscriberId, {
      accountIds: new Set(input.accountIds),
      onEvent: input.onEvent,
    });

    return () => {
      this.subscribers.delete(input.subscriberId);
    };
  }

  publish(event: MailChangedEvent): void {
    for (const subscriber of this.subscribers.values()) {
      if (!subscriber.accountIds.has(event.accountId)) {
        continue;
      }

      subscriber.onEvent(event);
    }
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
            this.publish({
              type: "mail.changed",
              accountId: result.accountId,
              changedTypes: result.changedTypes,
              receivedAt,
              sync: result.sync,
            });
          }
        })
        .catch((error) => {
          logger.warn("Receipt-time mail polling failed", {
            error: error instanceof Error ? error.message : String(error),
          });
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

    while (true) {
      try {
        logger.info("Connecting to Stalwart JMAP EventSource");
        await this.consumeEventSource();
        logger.warn(
          "Stalwart JMAP EventSource connection closed; reconnecting.",
        );
      } catch (error) {
        logger.error("Stalwart JMAP EventSource listener failed", {
          error,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, reconnectDelayMs));
    }
  }

  private async consumeEventSource(): Promise<void> {
    const response = await (this.input.fetcher ?? fetch)(
      buildSseRequestUrl(this.input.eventSourceUrl),
      {
        method: "GET",
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
        this.publish(event);
      }
    }
  }
}
