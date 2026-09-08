/** Reject path traversal and non-JMAP upstream targets for the mail proxy. */

export const MAX_JMAP_PROXY_REDIRECT_HOPS = 5;

const JMAP_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

export function isJmapRedirectStatus(status: number): boolean {
  return JMAP_REDIRECT_STATUSES.has(status);
}

export function resolveAllowedJmapRedirectUrl(
  upstreamBaseUrl: string,
  currentUrl: string,
  location: string,
): string {
  const baseOrigin = new URL(`${normalizeBaseUrl(upstreamBaseUrl)}/`).origin;
  let resolved: URL;
  try {
    resolved = new URL(location, currentUrl);
  } catch {
    throw new JmapProxyPathError("Invalid redirect location.");
  }

  if (resolved.origin !== baseOrigin) {
    throw new JmapProxyPathError("Redirect target is not allowed.");
  }

  return buildSafeJmapUpstreamUrl(
    upstreamBaseUrl,
    resolved.pathname,
    resolved.search,
  );
}

export type JmapProxyFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** Follow same-origin JMAP redirects server-side; never pass 307s to clients. */
export async function fetchJmapUpstream(
  fetcher: JmapProxyFetcher,
  upstreamBaseUrl: string,
  upstreamUrl: string,
  init: RequestInit,
): Promise<Response> {
  let currentUrl = upstreamUrl;
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_JMAP_PROXY_REDIRECT_HOPS; hop++) {
    response = await fetcher(currentUrl, { ...init, redirect: "manual" });
    if (!isJmapRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    if (hop === MAX_JMAP_PROXY_REDIRECT_HOPS) {
      throw new JmapProxyPathError("Too many upstream redirects.");
    }

    await response.arrayBuffer().catch(() => undefined);

    currentUrl = resolveAllowedJmapRedirectUrl(
      upstreamBaseUrl,
      currentUrl,
      location,
    );

    const method = (init.method ?? "GET").toUpperCase();
    if (response.status === 307 || response.status === 308) {
      continue;
    }

    init = {
      ...init,
      method: "GET",
      body: undefined,
    };
    if (method === "HEAD") {
      init.method = "HEAD";
    }
  }

  return response!;
}
