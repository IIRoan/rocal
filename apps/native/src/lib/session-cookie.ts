import { AUTH_STORAGE_PREFIX } from "./constants";
import {
  getChunkedSecureValueSync,
  readChunkedSecureValue,
  writeChunkedSecureValue,
} from "./secure-store-chunked";

type CookieEntry = { value: string; expires: string | null };

const COOKIE_STORE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;
const SESSION_TOKEN_COOKIE_PATTERN = "session_token";
export const PASSKEY_STEP_UP_COOKIE_NAME = "solace-passkey-step-up";
const PASSKEY_STEP_UP_COOKIE_VALUE = "verified";
const PASSKEY_STEP_UP_MAX_AGE_MS = 60 * 60 * 24 * 30 * 1000;

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
    return JSON.parse(raw) as Record<string, CookieEntry>;
  } catch {
    return {};
  }
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
