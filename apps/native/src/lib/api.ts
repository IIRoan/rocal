/**
 * Singleton HTTP client and CalendarApiService instances for the native app.
 *
 * The `HttpClient` is configured with the backend base URL and a
 * `getHeaders` callback that injects auth cookies managed by
 * `@better-auth/expo`.
 *
 * The `CalendarApiService` starts with a `NoopE2eeProvider` and is
 * upgraded to the real native E2EE provider after bootstrap completes
 * (via `setE2eeProvider`).
 */
import {
  HttpClient,
  CalendarApiService,
  NoopE2eeProvider,
} from "@workspace/calendar-client";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "./constants";

/**
 * The expo client plugin stores cookies in SecureStore under
 * `${storagePrefix}_cookie` as a JSON object of
 * `{ [name]: { value: string; expires: string | null } }`.
 *
 * We reconstruct the `cookie` header string from that stored value
 * so the standalone HttpClient sends the same session cookie that
 * the Better Auth client manages.
 */
const COOKIE_STORE_KEY = "solace_cookie";

function getSessionCookie(): string {
  const raw = SecureStore.getItem(COOKIE_STORE_KEY);
  if (!raw) return "";

  try {
    const parsed: Record<string, { value: string; expires: string | null }> =
      JSON.parse(raw);

    return Object.entries(parsed)
      .filter(([, entry]) => {
        // Drop expired cookies
        if (entry.expires && new Date(entry.expires) < new Date()) return false;
        return true;
      })
      .map(([name, entry]) => `${name}=${entry.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

export const httpClient = new HttpClient({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  retries: 3,
  retryDelay: 1_000,
  credentials: "include",
  getHeaders: (): Record<string, string> => {
    const cookie = getSessionCookie();
    if (cookie) return { cookie };
    return {};
  },
});

export const calendarApiService = new CalendarApiService(
  httpClient,
  new NoopE2eeProvider(),
);
