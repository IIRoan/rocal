import {
  APP_NOTIFICATION_SETTING,
  EMAIL_REMINDER_SETTING,
} from "@workspace/calendar-core";
import type { AccountSheetSearchEntry } from "./account-sheet-model";
import { THEME_OPTIONS, TIME_FORMAT_OPTIONS } from "./settings-options";

/** Settings inside the shared pages that both apps render in the account drawer. */
export const SHARED_SETTINGS_SEARCH_ENTRIES: AccountSheetSearchEntry[] = [
  ...THEME_OPTIONS.map((option) => ({
    pageId: "appearance",
    label: option.label,
    location: "Appearance · Theme",
    keywords: "mode theme color scheme",
  })),
  ...TIME_FORMAT_OPTIONS.map((option) => ({
    pageId: "time-region",
    label: option.label,
    location: "Time & Region · Time format",
    keywords: "clock hour",
  })),
  {
    pageId: "timezone",
    label: "Timezone",
    location: "Time & Region · Region",
    keywords: "time zone region",
  },
  {
    pageId: "notifications",
    label: EMAIL_REMINDER_SETTING.label,
    location: "Notifications · Mail",
    keywords: "email",
  },
  {
    pageId: "notifications",
    label: APP_NOTIFICATION_SETTING.label,
    location: "Notifications · App",
    keywords: "push alerts iphone",
  },
  {
    pageId: "notifications",
    label: "Devices",
    location: "Notifications · Devices",
    keywords: "push registered",
  },
  {
    pageId: "security",
    label: "On-device search index",
    location: "Security · Encryption",
    keywords: "titles searchable",
  },
  {
    pageId: "security",
    label: "Reset encryption password",
    location: "Security · Encryption",
    keywords: "keys",
  },
  {
    pageId: "security",
    label: "Passkeys",
    location: "Security · Passkeys",
    keywords: "add passkey passwordless biometric",
  },
  {
    pageId: "account",
    label: "Change password",
    location: "Account · Profile and sign-in",
    keywords: "set email password",
  },
  {
    pageId: "account",
    label: "Profile picture",
    location: "Account · Profile and sign-in",
    keywords: "photo avatar image",
  },
  {
    pageId: "account",
    label: "Sign out",
    location: "Account · Session",
    keywords: "log out",
  },
  {
    pageId: "account",
    label: "Delete account",
    location: "Account · Session",
    keywords: "remove",
  },
  {
    pageId: "invites",
    label: "Send invite",
    location: "Invites · Invite someone",
    keywords: "friend email link",
  },
  {
    pageId: "app",
    label: "Updates",
    location: "App · Updates",
    keywords: "expo version",
  },
  {
    pageId: "app",
    label: "Copy diagnostics",
    location: "App · Debugging",
    keywords: "debug logs",
  },
  {
    pageId: "app",
    label: "Clear session cookies",
    location: "App · Debugging",
    keywords: "debug",
  },
  {
    pageId: "app",
    label: "Send test error",
    location: "App · Debugging",
    keywords: "debug crash report",
  },
];
