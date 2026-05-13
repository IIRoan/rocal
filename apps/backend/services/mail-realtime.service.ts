import { createLogger } from "@workspace/logger";

export type MailChangedEvent = {
  type: "mail.changed";
  accountId: string;
  changedTypes: string[];
  receivedAt: string;
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
      const rawValue = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
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

export class MailRealtimeService {
  private readonly subscribers = new Map<string, MailRealtimeSubscriber>();
  private started = false;

  constructor(
    private readonly input: {
      eventSourceUrl: string;
      adminToken: string;
      fetcher?: typeof fetch;
      reconnectDelayMs?: number;
    },
  ) {}

  start(): void {
    if (this.started || !this.input.adminToken.trim()) {
      if (!this.input.adminToken.trim()) {
        logger.warn(
          "Mail realtime listener disabled because STALWART_ADMIN_TOKEN is missing.",
        );
      }
      return;
    }

    this.started = true;
    void this.listenForever();
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

  private async listenForever(): Promise<void> {
    const reconnectDelayMs = this.input.reconnectDelayMs ?? 3000;

    while (true) {
      try {
        logger.info("Connecting to Stalwart JMAP EventSource");
        await this.consumeEventSource();
        logger.warn("Stalwart JMAP EventSource connection closed; reconnecting.");
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

      const payload = JSON.parse(frame.data) as StalwartStateChange;
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
