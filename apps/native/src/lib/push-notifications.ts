import * as SecureStore from "expo-secure-store";
import type { QueryClient } from "@tanstack/react-query";
import type { RegisterPushDeviceRequest } from "@workspace/calendar-core";
import { calendarApiService } from "./api";
import { SECURE_STORE_KEYS } from "./constants";
import {
  CALENDAR_TAB_ROUTE,
  eventDetailRoute,
  MAIL_TAB_ROUTE,
  mailMessageRoute,
} from "./navigation-routes";
import { QUERY_KEYS } from "./query-keys";

export type PushTapData = {
  t?: unknown;
  eid?: unknown;
  mid?: unknown;
};

export type PushDeviceMeta = Omit<RegisterPushDeviceRequest, "token">;

export type RegisterPushDeviceResult = "registered" | "unchanged";

let lastRegisteredToken: string | null = null;
let registerInFlight: Promise<RegisterPushDeviceResult> | null = null;
let registerInFlightToken: string | null = null;

export function resetPushRegistrationDedupeForTests(): void {
  lastRegisteredToken = null;
  registerInFlight = null;
  registerInFlightToken = null;
}

export function mapPushNotificationToRoute(data: PushTapData): string | null {
  const type = typeof data.t === "string" ? data.t : "";
  if (type === "event") {
    const eventId = typeof data.eid === "string" ? data.eid.trim() : "";
    return eventId ? eventDetailRoute(eventId) : CALENDAR_TAB_ROUTE;
  }
  if (type === "mail") {
    const mailId = typeof data.mid === "string" ? data.mid.trim() : "";
    return mailId ? mailMessageRoute(mailId) : MAIL_TAB_ROUTE;
  }
  return null;
}

export function invalidateQueriesForPushTap(
  queryClient: QueryClient,
  data: PushTapData,
): void {
  const type = typeof data.t === "string" ? data.t : "";
  if (type === "event") {
    const eventId = typeof data.eid === "string" ? data.eid.trim() : "";
    if (eventId) {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.eventDetail(eventId),
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["events"] });
    return;
  }
  if (type === "mail") {
    const mailId = typeof data.mid === "string" ? data.mid.trim() : "";
    if (mailId) {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.mailMessage(mailId),
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["mail", "messages"] });
  }
}

export function resolvePushDeviceMeta(input: {
  platform: string;
  bundleId?: string | null;
  appVariant?: string | null;
}): PushDeviceMeta | null {
  if (input.platform !== "ios") {
    return null;
  }

  const bundleId =
    input.bundleId === "onl.solace.mobile.dev" ||
      input.bundleId === "onl.solace.mobile"
      ? input.bundleId
      : null;
  if (!bundleId) {
    return null;
  }

  return {
    platform: "ios",
    bundleId,
    environment: input.appVariant === "development" ? "sandbox" : "production",
  };
}

export async function loadStoredPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_STORE_KEYS.PUSH_TOKEN);
  } catch {
    return null;
  }
}

export async function persistPushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.PUSH_TOKEN, token);
}

export async function clearStoredPushToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.PUSH_TOKEN);
  } catch {
    // Best-effort — sign-out should continue even if SecureStore fails.
  }
  lastRegisteredToken = null;
}

export async function registerNativePushDevice(input: {
  token: string;
  meta: PushDeviceMeta;
  force?: boolean;
}): Promise<RegisterPushDeviceResult> {
  const token = input.token.trim();
  if (!token) {
    return "unchanged";
  }

  if (!input.force && lastRegisteredToken === token) {
    return "unchanged";
  }

  // Claim before any await so concurrent callers coalesce onto one request.
  if (registerInFlight && registerInFlightToken === token) {
    return registerInFlight;
  }

  registerInFlightToken = token;
  registerInFlight = (async () => {
    if (!input.force) {
      const stored = await loadStoredPushToken();
      if (stored === token || lastRegisteredToken === token) {
        lastRegisteredToken = token;
        return "unchanged" as const;
      }
    }

    await calendarApiService.registerPushDevice({
      ...input.meta,
      token,
    });
    await persistPushToken(token);
    lastRegisteredToken = token;
    return "registered" as const;
  })().finally(() => {
    registerInFlight = null;
    registerInFlightToken = null;
  });

  return registerInFlight;
}

export async function unregisterNativePushDevice(): Promise<void> {
  const token = await loadStoredPushToken();
  if (!token) {
    return;
  }
  try {
    await calendarApiService.unregisterPushDevice(token);
  } catch {
    // Best-effort — local cleanup still runs if the API is unreachable.
  }
  await clearStoredPushToken();
}
