import type { SettingsHubId, SettingsMailId } from "@workspace/calendar-core";
import type { Feather } from "@expo/vector-icons";

type FeatherIcon = keyof typeof Feather.glyphMap;

export const SETTINGS_HUB_ICONS: Record<SettingsHubId, FeatherIcon> = {
  account: "user",
  appearance: "sun",
  calendar: "calendar",
  mail: "mail",
  "time-region": "globe",
  notifications: "bell",
  security: "shield",
  invites: "user-plus",
  app: "smartphone",
};

export const SETTINGS_MAIL_ICONS: Record<SettingsMailId, FeatherIcon> = {
  mailboxes: "folder",
  labels: "tag",
  contacts: "users",
  composing: "edit-3",
  "mail-display": "eye",
  "mail-list": "list",
};
