/** Singleton HTTP client + API services; the E2EE provider is upgraded after bootstrap via setE2eeProvider. */
import {
  AccountApiService,
  HttpClient,
  CalendarApiService,
  InviteApiService,
  NoopE2eeProvider,
} from "@workspace/calendar-client";
import * as Linking from "expo-linking";
import { API_BASE_URL, APP_SCHEME } from "./constants";
import {
  getSessionCookie,
  getSessionCookieAsync,
  persistSessionTokenCookie,
  persistRenewedSessionCookie,
  waitForSessionCookie,
} from "./session-cookie";
import { triggerSessionClear } from "./session-clear";
import { triggerPasskeyStepUpRequired } from "./passkey-step-up-required";
import { getFallbackSessionToken } from "./session-token-fallback";
import { authClient } from "./auth-client";
import { captureException, captureMessage } from "./reporting";

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

export async function getAuthHeadersAsync(): Promise<Record<string, string>> {
  let cookie = await getSessionCookieAsync();
  if (!cookie) {
    const didFindCookie = await waitForSessionCookie(750, 50);
    if (didFindCookie) {
      cookie = await getSessionCookieAsync();
    }
  }
  const expoOrigin = getNativeExpoOrigin();

  return {
    ...(cookie ? { cookie } : {}),
    ...(expoOrigin ? { "expo-origin": expoOrigin } : {}),
    "x-skip-oauth-proxy": "true",
  };
}

let confirmingAuthError = false;

async function confirmExpiredSessionThenClear() {
  if (confirmingAuthError) {
    return;
  }
  confirmingAuthError = true;
  try {
    const fallback = getFallbackSessionToken();
    if (fallback) {
      await persistSessionTokenCookie(fallback, {
        preferSecure: API_BASE_URL.startsWith("https://"),
      });
    }

    let sessionConfirmed = false;
    let getSessionErrored = false;
    try {
      const result = await authClient.getSession({
        query: { disableCookieCache: true },
      });
      if (result?.data?.user) {
        sessionConfirmed = true;
      }
      if (result?.error) getSessionErrored = true;
    } catch (error) {
      getSessionErrored = true;
      captureException(error, {
        tags: { area: "auth", reason: "post-401-get-session" },
      });
    }

    if (sessionConfirmed) {
      return;
    }

    if (getSessionErrored) {
      captureMessage(
        "Session validation unavailable after 401; retaining local session",
        { level: "warning", tags: { area: "auth" } },
      );
      return;
    }

    captureMessage("Clearing session after 401", {
      level: "warning",
      tags: { area: "auth" },
    });
    triggerSessionClear();
  } finally {
    confirmingAuthError = false;
  }
}

export const httpClient = new HttpClient({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  retries: 3,
  retryDelay: 1_000,
  credentials: "omit",
  getHeaders: getAuthHeadersAsync,
  onAuthError: () => {
    void confirmExpiredSessionThenClear().catch((error) => {
      captureException(error, {
        tags: { area: "auth", reason: "confirm-session-clear" },
      });
    });
  },
  onPasskeyStepUpRequired: triggerPasskeyStepUpRequired,
  onResponseHeaders: persistRenewedSessionCookie,
});

export const calendarApiService = new CalendarApiService(
  httpClient,
  new NoopE2eeProvider(),
);

export const accountApiService = new AccountApiService(httpClient);

export const inviteApiService = new InviteApiService(httpClient);
