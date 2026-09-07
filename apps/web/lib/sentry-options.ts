/**
 * Shared Sentry/errex options for Solace web (client, Node, edge).
 *
 * Official `@sentry/*` SDKs require a *numeric* DSN project id. Errex uses a
 * string project name (`solace`), so we keep the real DSN in env, feed the SDK
 * a numeric stand-in, and `tunnel` envelopes to `/api/solace/envelope/`.
 */
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

export function getWebSentryOptions() {
  const raw =
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    process.env.SENTRY_DSN?.trim() ||
    "";
  if (!raw) {
    return null;
  }

  const parsed = parseErrexDsn(raw);
  if (!parsed) {
    return null;
  }

  const { key, host, project } = parsed;
  // Numeric projectId satisfies SDK DSN validation; tunnel targets the real
  // errex project path and carries sentry_key for ERREX_REQUIRE_AUTH.
  const sdkDsn = `https://${key}@${host}/1`;
  const tunnel = `https://${host}/api/${encodeURIComponent(project)}/envelope/?sentry_key=${encodeURIComponent(key)}`;

  return {
    dsn: sdkDsn,
    tunnel,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV ||
      "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "AbortError",
      /Loading chunk [\d]+ failed/,
    ],
  };
}
