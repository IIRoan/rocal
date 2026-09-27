export const MAIL_DISPLAY_SETTINGS_STORAGE_KEY = "mail:displaySettings";
export const MAIL_COMPOSE_SETTINGS_STORAGE_KEY = "mail:composeSettings";
export const MAIL_LIST_SETTINGS_STORAGE_KEY = "mail:listSettings";
export const MAIL_SETTINGS_SYNC_PENDING_KEY = "mail:settingsSyncPending";

const LEGACY_MAIL_DISPLAY_KEYS = [
  "mail:blockRemoteImages",
  "mail:blockTrackingPixels",
  "mail:darkMode",
];

/** Trusted senders are PII, and a leftover copy would be uploaded into the next account that signs in here. */
export function clearLocalMailSettings(): void {
  if (typeof window === "undefined") return;
  for (const key of [
    MAIL_DISPLAY_SETTINGS_STORAGE_KEY,
    MAIL_COMPOSE_SETTINGS_STORAGE_KEY,
    MAIL_LIST_SETTINGS_STORAGE_KEY,
    MAIL_SETTINGS_SYNC_PENDING_KEY,
    ...LEGACY_MAIL_DISPLAY_KEYS,
  ]) {
    localStorage.removeItem(key);
  }
}
