/**
 * Errex/Sentry bootstrap for the Bun API (local + Vercel).
 * No-ops when SENTRY_DSN is unset so local/dev stays quiet by default.
 *
 * `@sentry/bun` rejects non-numeric DSN project ids; errex uses string names.
 * We init with a numeric stand-in and tunnel to `/api/<project>/envelope/`.
 */
import * as Sentry from "@sentry/bun";
import {
  scrubBreadcrumb,
  scrubErrorEvent,
} from "@workspace/calendar-core/report-redaction";
import {
  BACKEND_REDACTION_OPTIONS,
  sanitizeLogContext,
} from "./log-sanitization";

let initialized = false;

function parseErrexDsn(raw: string): {
  key: string;
  host: string;
  project: string;
} | null {
  try {
    const url = new URL(raw);
    const key = url.username.trim();
    const host = url.host.trim();
    const project = url.pathname.replace(/^\/+|\/+$/g, "").trim();
    if (!key || !host || !project) {
      return null;
    }
    return { key, host, project };
  } catch {
    return null;
  }
}

export function initSentry(): void {
  if (initialized) {
    return;
  }

  const raw = process.env.SENTRY_DSN?.trim();
  if (!raw) {
    return;
  }

  const parsed = parseErrexDsn(raw);
  if (!parsed) {
    return;
  }

  const { key, host, project } = parsed;

  Sentry.init({
    dsn: `https://${key}@${host}/1`,
    tunnel: `https://${host}/api/${encodeURIComponent(project)}/envelope/?sentry_key=${encodeURIComponent(key)}`,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Last line of defence: SDK integrations attach data that never met our log sanitizers.
    beforeSend: (event) => scrubErrorEvent(event, BACKEND_REDACTION_OPTIONS),
    beforeBreadcrumb: (breadcrumb) =>
      scrubBreadcrumb(breadcrumb, BACKEND_REDACTION_OPTIONS),
  });

  initialized = true;
}

export function reportException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!process.env.SENTRY_DSN?.trim()) {
    return;
  }

  initSentry();

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(sanitizeLogContext(context));
      const requestId = context.requestId;
      if (typeof requestId === "string" && requestId.length > 0) {
        scope.setTag("requestId", requestId);
      }
    }
    Sentry.captureException(error);
  });
}
