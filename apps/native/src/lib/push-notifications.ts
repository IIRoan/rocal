import * as SecureStore from "expo-secure-store";
import type { Notification } from "expo-notifications";
import type { QueryClient } from "@tanstack/react-query";
import {
  isSolaceIosBundleId,
  type RegisterPushDeviceRequest,
} from "@workspace/calendar-core";
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

export function normalizePushTapData(raw: unknown): PushTapData | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const type = typeof record.t === "string" ? record.t.trim() : "";
  if (type !== "event" && type !== "mail") {
    return null;
  }

  const data: PushTapData = { t: type };
  const eventId = typeof record.eid === "string" ? record.eid.trim() : "";
  const mailId =
    typeof record.mid === "string"
      ? record.mid.trim()
      : typeof record.emailId === "string"
        ? record.emailId.trim()
        : "";

  if (eventId) {
    data.eid = eventId;
  }
  if (mailId) {
    data.mid = mailId;
  }

  return data;
}

function collectPushTapDataCandidates(
  notification: Notification | null | undefined,
): unknown[] {
  const candidates: unknown[] = [];
  const contentData = notification?.request.content.data;
  if (contentData && typeof contentData === "object") {
    candidates.push(contentData);
    const nestedBody = (contentData as Record<string, unknown>).body;
    if (nestedBody && typeof nestedBody === "object") {
      candidates.push(nestedBody);
    }
  }

  const trigger = notification?.request.trigger;
  if (
    trigger &&
    typeof trigger === "object" &&
    "type" in trigger &&
    trigger.type === "push"
  ) {
    const payload = (trigger as { payload?: unknown }).payload;
    if (payload && typeof payload === "object") {
      candidates.push(payload);
      const nestedBody = (payload as Record<string, unknown>).body;
      if (nestedBody && typeof nestedBody === "object") {
        candidates.push(nestedBody);
      }
      const { t, eid, mid, emailId } = payload as Record<string, unknown>;
      if (t || eid || mid || emailId) {
        candidates.push({ t, eid, mid, emailId });
      }
    }
  }

  return candidates;
}

export function extractPushTapData(
  notification: Notification | null | undefined,
): PushTapData {
  for (const candidate of collectPushTapDataCandidates(notification)) {
    const normalized = normalizePushTapData(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return {};
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

  if (!isSolaceIosBundleId(input.bundleId)) {
    return null;
  }

  return {
    platform: "ios",
    bundleId: input.bundleId,
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
