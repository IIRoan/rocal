import { AUTH_STORAGE_PREFIX } from "./constants";
import {
  getChunkedSecureValueSync,
  readChunkedSecureValue,
} from "./secure-store-chunked";

type CookieEntry = { value: string; expires: string | null };

const COOKIE_STORE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;
const SESSION_TOKEN_COOKIE_PATTERN = "session_token";

function parseCookieEntries(
  raw: string | null | undefined,
  now: Date,
): [string, CookieEntry][] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, CookieEntry>;

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
  return parseCookieEntries(raw, now)
    .map(([name, entry]) => `${name}=${entry.value}`)
    .join("; ");
}

export function hasSessionTokenCookie(
  raw: string | null | undefined,
  now: Date = new Date(),
) {
  return parseCookieEntries(raw, now).some(([name]) =>
    name.includes(SESSION_TOKEN_COOKIE_PATTERN),
  );
}

export function getSessionCookie(): string {
  return parseSessionCookie(getChunkedSecureValueSync(COOKIE_STORE_KEY));
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
