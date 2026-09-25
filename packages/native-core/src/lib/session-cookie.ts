import { AUTH_STORAGE_PREFIX, API_BASE_URL } from "./constants";
import {
  getChunkedSecureValueSync,
  readChunkedSecureValue,
  readRawSecureValue,
  writeChunkedSecureValue,
} from "./secure-store-chunked";
import {
  fallbackSessionCookieHeader,
  setFallbackSessionToken,
} from "./session-token-fallback";

type CookieEntry = { value: string; expires: string | null };

const COOKIE_STORE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;
const SESSION_TOKEN_COOKIE_PATTERN = "session_token";
export const PASSKEY_STEP_UP_COOKIE_NAME = "solace-passkey-step-up";
const PASSKEY_STEP_UP_COOKIE_VALUE = "verified";
const PASSKEY_STEP_UP_MAX_AGE_MS = 60 * 60 * 24 * 30 * 1000;

function asCookieStore(
  value: unknown,
): Record<string, CookieEntry> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, CookieEntry>;
}

function parseCookieEntries(
  raw: string | null | undefined,
  now: Date,
): [string, CookieEntry][] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = asCookieStore(JSON.parse(raw));
    if (!parsed) {
      return [];
    }

    return Object.entries(parsed).filter(([name, entry]) => {
      if (entry.expires && new Date(entry.expires) < now) return false;
      return Boolean(name) && typeof entry?.value === "string";
    });
  } catch {
    return [];
  }
}

export function parseSessionCookie(
  raw: string | null | undefined,
  now: Date = new Date(),
): string {
  const fromJar = parseCookieEntries(raw, now)
    .map(([name, entry]) => `${name}=${entry.value}`)
    .join("; ");
  if (fromJar) {
    return fromJar;
  }
  return fallbackSessionCookieHeader(API_BASE_URL.startsWith("https://"));
}

export function hasSessionTokenCookie(
  raw: string | null | undefined,
  now: Date = new Date(),
) {
  return parseCookieEntries(raw, now).some(([name]) =>
    name.includes(SESSION_TOKEN_COOKIE_PATTERN),
  );
}

function getSessionTokenCookieValue(
  raw: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const match = parseCookieEntries(raw, now).find(([name]) =>
    name.includes(SESSION_TOKEN_COOKIE_PATTERN),
  );
  return match?.[1]?.value ?? null;
}

export async function readSessionTokenFromJar(): Promise<string | null> {
  return getSessionTokenCookieValue(await readChunkedSecureValue(COOKIE_STORE_KEY));
}

export async function rememberSessionTokenFromJar(): Promise<string | null> {
  const fromJar = await readSessionTokenFromJar();
  if (fromJar) {
    setFallbackSessionToken(fromJar);
  }
  return fromJar;
}

export function hasPasskeyStepUpCookie(
  raw: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return parseCookieEntries(raw, now).some(
    ([name, entry]) =>
      name === PASSKEY_STEP_UP_COOKIE_NAME &&
      entry.value === PASSKEY_STEP_UP_COOKIE_VALUE,
  );
}

function readCookieStoreRaw(): string {
  return getChunkedSecureValueSync(COOKIE_STORE_KEY) ?? "{}";
}

function parseCookieStore(
  raw: string | null | undefined,
): Record<string, CookieEntry> {
  if (!raw) {
    return {};
  }

  try {
    // Legacy chunk meta `"1"` JSON.parses to number 1 — never treat that as a jar.
    return asCookieStore(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

/**
 * Rewrite a legacy digit chunk-meta jar (`"1"` + `_0`) into a plain JSON object
 * so Better Auth never sees `JSON.parse("1") === 1`.
 */
export async function healAuthCookieJar(): Promise<void> {
  const rawMeta = await readRawSecureValue(COOKIE_STORE_KEY);
  if (!rawMeta || !/^\d+$/.test(rawMeta)) {
    return;
  }

  const reassembled = await readChunkedSecureValue(COOKIE_STORE_KEY);
  const jar = parseCookieStore(reassembled);
  await writeChunkedSecureValue(COOKIE_STORE_KEY, JSON.stringify(jar));
}

export async function persistPasskeyStepUpCookie(): Promise<void> {
  const raw = (await readChunkedSecureValue(COOKIE_STORE_KEY)) ?? "{}";
  const cookies = parseCookieStore(raw);
  cookies[PASSKEY_STEP_UP_COOKIE_NAME] = {
    value: PASSKEY_STEP_UP_COOKIE_VALUE,
    expires: new Date(Date.now() + PASSKEY_STEP_UP_MAX_AGE_MS).toISOString(),
  };

  await writeChunkedSecureValue(COOKIE_STORE_KEY, JSON.stringify(cookies));
}

export async function waitForPasskeyStepUpCookie(
  timeoutMs = 3_000,
  pollIntervalMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (hasPasskeyStepUpCookie(readCookieStoreRaw())) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return hasPasskeyStepUpCookie(readCookieStoreRaw());
}

export function getSessionCookie(): string {
  return parseSessionCookie(getChunkedSecureValueSync(COOKIE_STORE_KEY));
}

export async function getSessionCookieAsync(): Promise<string> {
  return parseSessionCookie(await readChunkedSecureValue(COOKIE_STORE_KEY));
}

export async function waitForSessionCookie(
  timeoutMs = 3_000,
  pollIntervalMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const raw = await readChunkedSecureValue(COOKIE_STORE_KEY);
    if (hasSessionTokenCookie(raw)) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

function resolveSessionTokenCookieName(
  cookies: Record<string, CookieEntry>,
  preferSecure: boolean,
): string {
  const existing = Object.keys(cookies).find((name) =>
    name.includes(SESSION_TOKEN_COOKIE_PATTERN),
  );
  if (existing) return existing;
  return preferSecure
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
}

/** Persist session token into the Expo jar when Set-Cookie was lost/clobbered. */
export async function persistSessionTokenCookie(
  token: string,
  options?: { preferSecure?: boolean; maxAgeMs?: number },
): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;

  setFallbackSessionToken(trimmed);

  const preferSecure = options?.preferSecure ?? true;
  const maxAgeMs = options?.maxAgeMs ?? 60 * 60 * 24 * 30 * 1000;
  const raw = (await readChunkedSecureValue(COOKIE_STORE_KEY)) ?? "{}";
  const cookies = parseCookieStore(raw);
  const name = resolveSessionTokenCookieName(cookies, preferSecure);
  cookies[name] = {
    value: trimmed,
    expires: new Date(Date.now() + maxAgeMs).toISOString(),
  };

  await writeChunkedSecureValue(COOKIE_STORE_KEY, JSON.stringify(cookies));
}

export async function ensureSessionTokenCookie(
  token: string | null | undefined,
  options?: { preferSecure?: boolean; maxAgeMs?: number },
): Promise<boolean> {
  const trimmed = token?.trim();
  if (!trimmed) return false;

  const raw = await readChunkedSecureValue(COOKIE_STORE_KEY);
  const existing = getSessionTokenCookieValue(raw);
  // Keep Better Auth's Set-Cookie value. The email payload `token` is not
  // always the same string as the signed cookie, and overwriting it 401s.
  if (existing) {
    setFallbackSessionToken(existing);
    return true;
  }

  await persistSessionTokenCookie(trimmed, options);
  return true;
}
