import {
  getErrexReportingOptions,
  parseErrexDsn,
  type ErrexReportingOptions,
} from "./errex-dsn";

type ReportTags = Record<string, string>;

type ExceptionContext = {
  tags?: ReportTags;
};

type MessageContext = {
  level?: "error" | "warning" | "info";
  tags?: ReportTags;
};

const pendingReports = new Set<Promise<void>>();

function randomEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
    .padEnd(32, "0")
    .slice(0, 32);
}

export function buildErrexEnvelope(
  event: Record<string, unknown>,
  options: ErrexReportingOptions,
): string {
  const eventId = randomEventId();
  const header = JSON.stringify({
    event_id: eventId,
    sent_at: new Date().toISOString(),
  });
  const payload = JSON.stringify({
    event_id: eventId,
    platform: "javascript",
    environment: options.environment,
    timestamp: Date.now() / 1000,
    ...event,
  });
  const itemHeader = JSON.stringify({
    type: "event",
    length: payload.length,
  });

  return `${header}\n${itemHeader}\n${payload}`;
}

async function sendEnvelope(
  body: string,
  options: ErrexReportingOptions,
): Promise<void> {
  const response = await fetch(options.tunnel, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Errex ingest failed with HTTP ${response.status}`);
  }
}

function queueReport(task: () => Promise<void>): void {
  const report = task().catch(() => {
    // Reporting must never affect app behavior.
  });
  pendingReports.add(report);
  void report.finally(() => {
    pendingReports.delete(report);
  });
}

export function captureException(error: unknown, context?: ExceptionContext): void {
  const options = getErrexReportingOptions();
  if (!options) {
    return;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  const envelope = buildErrexEnvelope(
    {
      exception: {
        values: [
          {
            type: err.name || "Error",
            value: err.message,
          },
        ],
      },
      tags: context?.tags ?? {},
    },
    options,
  );

  queueReport(() => sendEnvelope(envelope, options));
}

export function captureMessage(message: string, context?: MessageContext): void {
  const options = getErrexReportingOptions();
  if (!options) {
    return;
  }

  const envelope = buildErrexEnvelope(
    {
      message: { formatted: message },
      level: context?.level ?? "info",
      tags: context?.tags ?? {},
    },
    options,
  );

  queueReport(() => sendEnvelope(envelope, options));
}

export async function flushReporting(timeoutMs = 2_000): Promise<void> {
  if (pendingReports.size === 0) {
    return;
  }

  await Promise.race([
    Promise.allSettled([...pendingReports]),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

export { getErrexReportingOptions, parseErrexDsn };
