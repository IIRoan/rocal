import { env } from "./env";

const AUTH_COOKIE_PREFIX = "better-auth";
const SECURE_COOKIE_PREFIX = "__Secure-";

const BASE_AUTH_COOKIE_SUFFIXES = [
  "session_token",
  "session_data",
  "dont_remember",
  "account_data",
] as const;

type CookieSameSite = "lax" | "strict" | "none";

type ExpireTarget =
  | {
    headers: Headers;
  }
  | {
    setCookie: (
      name: string,
      value: string,
      options?: Record<string, unknown>,
    ) => void;
  };

function normalizeCookieSameSite(
  value: string | undefined,
): CookieSameSite {
  switch ((value ?? "").toLowerCase()) {
    case "strict":
      return "strict";
    case "none":
      return "none";
    default:
      return "lax";
  }
}

function getHostname(baseUrl: string): string | undefined {
  try {
    const hostname = new URL(baseUrl).hostname;
    if (!hostname || hostname === "localhost") {
      return undefined;
    }
    return hostname;
  } catch {
    return undefined;
  }
}

function getRootDomain(hostname: string): string | undefined {
  const parts = hostname.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : undefined;
}

function buildAuthCookieName(suffix: string, secure: boolean): string {
  const name = `${AUTH_COOKIE_PREFIX}.${suffix}`;
  return secure ? `${SECURE_COOKIE_PREFIX}${name}` : name;
}

function parseCookieNames(cookieHeader: string | null): string[] {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      return separatorIndex <= 0 ? entry : entry.slice(0, separatorIndex);
    });
}

/**
 * Cookie names that may still be host-scoped from before cross-subdomain
 * Domain switched to the eTLD+1 (e.g. api.solace.onl → solace.onl).
 */
export function collectLegacyAuthCookieNames(input: {
  request?: Request;
  isProduction: boolean;
}): string[] {
  const secure = input.isProduction;
  const names = new Set<string>(
    BASE_AUTH_COOKIE_SUFFIXES.map((suffix) =>
      buildAuthCookieName(suffix, secure),
    ),
  );

  const requestNames = parseCookieNames(
    input.request?.headers.get("cookie") ?? null,
  );

  for (const name of requestNames) {
    const unprefixed = name.startsWith(SECURE_COOKIE_PREFIX)
      ? name.slice(SECURE_COOKIE_PREFIX.length)
      : name;

    if (
      unprefixed === AUTH_COOKIE_PREFIX ||
      unprefixed.startsWith(`${AUTH_COOKIE_PREFIX}.`)
    ) {
      names.add(name);
    }
  }

  return [...names];
}

function serializeExpiredCookie(
  name: string,
  attributes: {
    path: string;
    sameSite: CookieSameSite;
    secure: boolean;
    httpOnly: boolean;
    domain?: string;
  },
): string {
  const parts = [
    `${name}=`,
    `Path=${attributes.path}`,
    "Max-Age=0",
    `SameSite=${attributes.sameSite}`,
  ];

  if (attributes.httpOnly) {
    parts.push("HttpOnly");
  }

  if (attributes.secure) {
    parts.push("Secure");
  }

  if (attributes.domain) {
    parts.push(`Domain=${attributes.domain}`);
  }

  return parts.join("; ");
}

function writeExpiredCookie(
  target: ExpireTarget,
  name: string,
  attributes: {
    path: string;
    sameSite: CookieSameSite;
    secure: boolean;
    httpOnly: boolean;
    domain?: string;
  },
) {
  if ("setCookie" in target && typeof target.setCookie === "function") {
    target.setCookie(name, "", {
      path: attributes.path,
      sameSite: attributes.sameSite,
      secure: attributes.secure,
      httpOnly: attributes.httpOnly,
      maxAge: 0,
      ...(attributes.domain ? { domain: attributes.domain } : {}),
    });
    return;
  }

  if ("headers" in target) {
    target.headers.append(
      "set-cookie",
      serializeExpiredCookie(name, attributes),
    );
  }
}

/**
 * Expire Better Auth cookies that were previously scoped to the API hostname
 * (Domain=api.example.com) after switching to eTLD+1 cross-subdomain cookies
 * (Domain=example.com). Browsers only clear a cookie when Domain matches, so
 * Better Auth's normal sign-out is not enough during the cutover.
 */
export function expireLegacyHostScopedAuthCookies(
  target: ExpireTarget,
  options?: {
    request?: Request;
    backendUrl?: string;
    isProduction?: boolean;
    cookieSameSite?: string;
  },
): void {
  const isProduction = options?.isProduction ?? env.isProduction;
  if (!isProduction) {
    return;
  }

  const backendUrl = options?.backendUrl ?? env.backendUrl;
  const hostname = getHostname(backendUrl);
  if (!hostname) {
    return;
  }

  const rootDomain = getRootDomain(hostname);
  if (!rootDomain || rootDomain === hostname) {
    return;
  }

  const sameSite = normalizeCookieSameSite(
    options?.cookieSameSite ?? env.cookieSameSite,
  );
  const secure = true;
  const baseAttributes = {
    path: "/",
    sameSite,
    secure,
    httpOnly: true,
  } as const;

  const names = collectLegacyAuthCookieNames({
    request: options?.request,
    isProduction,
  });

  for (const name of names) {
    // Pre-fix Better Auth cookies used Domain=<API hostname>.
    writeExpiredCookie(target, name, {
      ...baseAttributes,
      domain: hostname,
    });
    // Host-only variants (no Domain) if any were ever stored.
    writeExpiredCookie(target, name, baseAttributes);
  }
}
