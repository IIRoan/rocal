/**
 * Shared Sentry/errex options for Solace web (client, Node, edge).
 * Errex is Sentry-envelope compatible; no source maps / session replay.
 */
const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
  process.env.SENTRY_DSN?.trim() ||
  "";

export function getWebSentryOptions() {
  if (!dsn) {
    return null;
  }

  return {
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      "development",
    // Solace must not ship PII / request bodies to error storage.
    sendDefaultPii: false,
    // Errex tracks exceptions; skip performance transactions for now.
    tracesSampleRate: 0,
    // Ignore noisy browser extensions / cancelled navigations.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "AbortError",
      /Loading chunk [\d]+ failed/,
    ],
  };
}
