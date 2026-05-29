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
  AccountApiService,
  HttpClient,
  CalendarApiService,
  NoopE2eeProvider,
} from "@workspace/calendar-client";
import * as Linking from "expo-linking";
import { API_BASE_URL, APP_SCHEME } from "./constants";
import { getSessionCookie } from "./session-cookie";
import { triggerSessionClear } from "../providers/AuthProvider";

export function getNativeExpoOrigin() {
  return Linking.createURL("", { scheme: APP_SCHEME });
}

export function getAuthHeaders(): Record<string, string> {
  const cookie = getSessionCookie();
  const expoOrigin = getNativeExpoOrigin();

  return {
    ...(cookie ? { cookie } : {}),
    ...(expoOrigin ? { "expo-origin": expoOrigin } : {}),
    "x-skip-oauth-proxy": "true",
  };
}

export const httpClient = new HttpClient({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  retries: 3,
  retryDelay: 1_000,
  credentials: "omit",
  getHeaders: getAuthHeaders,
  onAuthError: triggerSessionClear,
});

export const calendarApiService = new CalendarApiService(
  httpClient,
  new NoopE2eeProvider(),
);

export const accountApiService = new AccountApiService(httpClient);
