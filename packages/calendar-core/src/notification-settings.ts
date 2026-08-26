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
  const absSeconds = Math.round(Math.abs(diffMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absSeconds < 60) {
    return `Last seen ${rtf.format(Math.sign(diffMs) * absSeconds, "second")}`;
  }

  const absMinutes = Math.round(absSeconds / 60);
  if (absMinutes < 60) {
    return `Last seen ${rtf.format(Math.sign(diffMs) * absMinutes, "minute")}`;
  }

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 48) {
    return `Last seen ${rtf.format(Math.sign(diffMs) * absHours, "hour")}`;
  }

  const absDays = Math.round(absHours / 24);
  if (absDays < 30) {
    return `Last seen ${rtf.format(Math.sign(diffMs) * absDays, "day")}`;
  }

  const absMonths = Math.round(absDays / 30);
  if (absMonths < 12) {
    return `Last seen ${rtf.format(Math.sign(diffMs) * absMonths, "month")}`;
  }

  const absYears = Math.round(absDays / 365);
  return `Last seen ${rtf.format(Math.sign(diffMs) * absYears, "year")}`;
}
