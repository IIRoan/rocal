import { MAIL_SETTINGS_SYNC_PENDING_KEY } from "./mail-settings-storage";

let syncQueued = false;
let editGeneration = 0;
let saveChain: Promise<void> = Promise.resolve();

export function isMailSettingsSyncPending(): boolean {
  return (
    typeof window !== "undefined" &&
    localStorage.getItem(MAIL_SETTINGS_SYNC_PENDING_KEY) === "1"
  );
}

export function clearMailSettingsSyncPending(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(MAIL_SETTINGS_SYNC_PENDING_KEY);
  }
}

/** Coalesces local mail-pref writes into one encrypted upsert; saves run in order and each reads the latest prefs. */
export function scheduleMailSettingsServerSync(): void {
  if (typeof window === "undefined") return;
  editGeneration += 1;
  localStorage.setItem(MAIL_SETTINGS_SYNC_PENDING_KEY, "1");
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    saveChain = saveChain.then(async () => {
      const generation = editGeneration;
      try {
        const { readLocalMailSyncedSettings, saveMailSyncedSettings } =
          await import("../e2ee-mail-settings");
        const saved = await saveMailSyncedSettings(readLocalMailSyncedSettings());
        if (saved && generation === editGeneration) clearMailSettingsSyncPending();
      } catch {
        // The pending flag stays set, so the next load uploads these prefs instead of pulling stale ones.
      }
    });
  });
}
