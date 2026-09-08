/** Reject path traversal and non-JMAP upstream targets for the mail proxy. */

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export class JmapProxyPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JmapProxyPathError";
  }
}

function isAllowedJmapPathname(pathname: string): boolean {
  if (pathname.includes("\\")) {
    return false;
  }

  return (
    pathname === "/.well-known/jmap" ||
    pathname === "/jmap" ||
    pathname === "/jmap/" ||
    pathname === "/jmap/session" ||
    pathname.startsWith("/jmap/upload/") ||
    pathname.startsWith("/jmap/download/") ||
    pathname.startsWith("/jmap/eventsource")
  );
}

export function assertAllowedJmapUpstreamPath(
  upstreamBaseUrl: string,
  upstreamPath: string,
): { pathname: string } {
  const base = normalizeBaseUrl(upstreamBaseUrl);
  const baseUrl = new URL(`${base}/`);
  const pathInput = upstreamPath.startsWith("/")
    ? upstreamPath
    : `/${upstreamPath}`;

  let resolved: URL;
  try {
    resolved = new URL(pathInput, baseUrl);
  } catch {
    throw new JmapProxyPathError("Invalid proxy path.");
  }

  if (resolved.origin !== baseUrl.origin) {
    throw new JmapProxyPathError("Proxy path is not allowed.");
  }

  const pathname = resolved.pathname.replace(/\/+/g, "/");
  if (!isAllowedJmapPathname(pathname)) {
    throw new JmapProxyPathError("Proxy path is not allowed.");
  }

  return { pathname };
}

export function buildSafeJmapUpstreamUrl(
  upstreamBaseUrl: string,
  upstreamPath: string,
  search: string,
): string {
  const { pathname } = assertAllowedJmapUpstreamPath(
    upstreamBaseUrl,
    upstreamPath,
  );
  return `${normalizeBaseUrl(upstreamBaseUrl)}${pathname}${search}`;
}
