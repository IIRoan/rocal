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
