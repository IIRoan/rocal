import { SOLACE_IOS_DEV_BUNDLE_ID } from "./push-device";

export const EMAIL_REMINDER_SETTING = {
  label: "Email reminders",
  description: "Send event reminders to your inbox, including the event title.",
} as const;

export const APP_NOTIFICATION_SETTING = {
  label: "App notifications",
  description:
    "Lock-screen alerts for event reminders and new mail. Reminders include the event title; new mail includes the sender and subject when they are available.",
} as const;

export const NOTIFICATION_SETTINGS_INTRO =
  "Choose how Solace reaches you. Email and the iPhone app can both be on at once.";

export const APP_NOTIFICATION_WEB_HINT =
  "App notifications go to the Solace iPhone app. The web app does not show lock-screen alerts.";

export const APP_NOTIFICATION_IOS_ONLY_HINT =
  "Lock-screen alerts currently ship on iPhone.";

export const APP_NOTIFICATION_PERMISSION_HINT =
  "Notifications are turned off in iOS Settings. Enable them to receive lock-screen alerts.";

export const TEST_NOTIFICATION_SETTING = {
  label: "Send test notification",
  description: "Send a lock-screen alert to your registered iPhone.",
} as const;

export const TEST_NOTIFICATION_SUCCESS =
  "Test notification queued. Check your iPhone lock screen.";

export const PUSH_DEVICES_SECTION = {
  label: "Devices",
  description: "iPhones registered for lock-screen alerts",
  empty:
    "No iPhones are registered for lock-screen alerts yet. Open Solace on your iPhone with notifications allowed.",
  paused:
    "App notifications are off, so registered devices will not receive alerts until you turn them back on.",
  loading: "Loading devices…",
  error: "Could not load devices.",
} as const;

export const EVENT_ENCRYPTION_HINT =
  "Event title, description, and location stay ciphertext-only. Reminder emails and lock-screen alerts include the event title you set.";

export function formatNotificationChannelsSummary(settings?: {
  emailNotifications?: boolean | null;
  pushNotifications?: boolean | null;
} | null): string {
  const email = settings?.emailNotifications !== false;
  const app = settings?.pushNotifications !== false;
  if (email && app) return "Email and app";
  if (email) return "Email only";
  if (app) return "App only";
  return "Off";
}

export type PushDevicesListStatus =
  | "paused"
  | "loading"
  | "error"
  | "empty"
  | "ready";

export function getPushDevicesListStatus({
  appEnabled,
  loading,
  error,
  deviceCount,
}: {
  appEnabled: boolean;
  loading: boolean;
  error: boolean;
  deviceCount: number;
}): PushDevicesListStatus {
  if (!appEnabled) return "paused";
  if (loading) return "loading";
  if (error) return "error";
  if (deviceCount === 0) return "empty";
  return "ready";
}

const SOLACE_DEV_BUNDLE_ID = SOLACE_IOS_DEV_BUNDLE_ID;

export function formatPushDeviceLabel(device: {
  platform: string;
  bundleId: string;
}): string {
  if (device.platform === "ios") {
    return device.bundleId === SOLACE_DEV_BUNDLE_ID
      ? "iPhone · Solace Dev"
      : "iPhone";
  }
  return "Device";
}

export function formatPushDeviceLastSeen(
  lastSeenAt: string,
  now: Date = new Date(),
): string {
  const then = new Date(lastSeenAt);
  if (Number.isNaN(then.getTime())) {
    return "Last seen unknown";
  }

  const diffMs = then.getTime() - now.getTime();
  const sign = Math.sign(diffMs);
  const absSeconds = Math.round(Math.abs(diffMs) / 1000);
  const absMinutes = Math.round(absSeconds / 60);
  const absHours = Math.round(absMinutes / 60);
  const absDays = Math.round(absHours / 24);
  const absMonths = Math.round(absDays / 30);

  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    absSeconds < 60
      ? [absSeconds, "second"]
      : absMinutes < 60
        ? [absMinutes, "minute"]
        : absHours < 48
          ? [absHours, "hour"]
          : absDays < 30
            ? [absDays, "day"]
            : absMonths < 12
              ? [absMonths, "month"]
              : [Math.round(absDays / 365), "year"];

  return `Last seen ${formatRelativeTime(sign * amount, unit)}`;
}

/** Hermes (native) ships no `Intl.RelativeTimeFormat`, so fall back to English copy there. */
function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  if (typeof Intl.RelativeTimeFormat === "function") {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
      value,
      unit,
    );
  }
  if (value === 0) return "just now";
  const abs = Math.abs(value);
  const label = `${abs} ${unit}${abs === 1 ? "" : "s"}`;
  return value < 0 ? `${label} ago` : `in ${label}`;
}
