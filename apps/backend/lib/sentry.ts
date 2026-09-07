/**
 * Errex/Sentry bootstrap for the Bun API (local + Vercel).
 * No-ops when SENTRY_DSN is unset so local/dev stays quiet by default.
 */
import * as Sentry from "@sentry/bun";

let initialized = false;

export function initSentry(): void {
  if (initialized) {
    return;
  }

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
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
      scope.setExtras(context);
      const requestId = context.requestId;
      if (typeof requestId === "string" && requestId.length > 0) {
        scope.setTag("requestId", requestId);
      }
    }
    Sentry.captureException(error);
  });
}
