import * as SecureStore from "expo-secure-store";
import { AUTH_STORAGE_PREFIX } from "./constants";

type CookieEntry = { value: string; expires: string | null };

const COOKIE_STORE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;

export function parseSessionCookie(
  raw: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as Record<string, CookieEntry>;

    return Object.entries(parsed)
      .filter(([, entry]) => {
        if (entry.expires && new Date(entry.expires) < now) return false;
        return true;
      })
      .map(([name, entry]) => `${name}=${entry.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

export function getSessionCookie(): string {
  return parseSessionCookie(SecureStore.getItem(COOKIE_STORE_KEY));
}

export async function waitForSessionCookie(
  timeoutMs = 3_000,
  pollIntervalMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const raw = await SecureStore.getItemAsync(COOKIE_STORE_KEY);
    if (parseSessionCookie(raw)) return true;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}
