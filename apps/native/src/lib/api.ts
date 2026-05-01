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
import { API_BASE_URL } from "./constants";
import { getSessionCookie } from "./session-cookie";
import { triggerSessionClear } from "../providers/AuthProvider";

export function getAuthHeaders(): Record<string, string> {
  const cookie = getSessionCookie();
  if (cookie) return { cookie };
  return {};
}

export const httpClient = new HttpClient({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  retries: 3,
  retryDelay: 1_000,
  credentials: "include",
  getHeaders: getAuthHeaders,
  onAuthError: triggerSessionClear,
});

export const calendarApiService = new CalendarApiService(
  httpClient,
  new NoopE2eeProvider(),
);
