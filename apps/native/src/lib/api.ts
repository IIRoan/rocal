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

export const httpClient = new HttpClient({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  retries: 3,
  retryDelay: 1_000,
  credentials: "include",
});

export const calendarApiService = new CalendarApiService(
  httpClient,
  new NoopE2eeProvider(),
);
