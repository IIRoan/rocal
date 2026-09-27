import {
  assembleMailSyncedSettings,
  createMailSettingsCipher,
  pullMailSyncedSettings,
  pushMailSyncedSettings,
  sanitizeMailSyncedSettings,
  type MailSettingsCipher,
  type MailSyncedSettings,
} from "@workspace/calendar-core";
import { waitForPendingE2eeBootstrap } from "./e2ee-bootstrap";
import { decryptJsonPayload, encryptJsonPayload } from "./e2ee-crypto";
import { getActiveE2eeSession } from "./e2ee-session";
import { calendarApiService } from "./calendar-api-service";
import { readMailComposeSettings, writeMailComposeSettings } from "./mail/compose-settings";
import { readMailDisplaySettings, writeMailDisplaySettings } from "./mail/mail-display-settings";
import { readMailListSettings, writeMailListSettings } from "./mail/mail-list-settings";
import {
  isMailSettingsSyncPending,
  scheduleMailSettingsServerSync,
} from "./mail/schedule-mail-settings-sync";

async function getCipher(): Promise<MailSettingsCipher | null> {
  let session = getActiveE2eeSession();
  if (!session) {
    await waitForPendingE2eeBootstrap()?.catch(() => undefined);
    session = getActiveE2eeSession();
  }
  return session
    ? createMailSettingsCipher(
        { encryptJsonPayload, decryptJsonPayload },
        session.accountKey,
      )
    : null;
}

export function readLocalMailSyncedSettings(): MailSyncedSettings {
  return assembleMailSyncedSettings({
    display: readMailDisplaySettings(),
    compose: readMailComposeSettings(),
    list: readMailListSettings(),
  });
}

function writeLocalMailSyncedSettings(settings: MailSyncedSettings): MailSyncedSettings {
  const sanitized = sanitizeMailSyncedSettings(settings);
  writeMailDisplaySettings(sanitized.display, { sync: false });
  writeMailComposeSettings(sanitized.compose, { sync: false });
  writeMailListSettings(sanitized.list, { sync: false });
  return sanitized;
}

/** Uploads this device's prefs; resolves false when there is no E2EE session to seal them. */
export async function saveMailSyncedSettings(settings: MailSyncedSettings): Promise<boolean> {
  const cipher = await getCipher();
  if (!cipher) return false;
  await pushMailSyncedSettings(calendarApiService, cipher, settings);
  return true;
}

/** Server copy wins unless this device has an unsynced edit; unreadable server data never replaces local prefs. */
export async function loadMailSyncedSettings(): Promise<MailSyncedSettings | null> {
  const cipher = await getCipher();
  if (!cipher) return null;

  if (isMailSettingsSyncPending()) {
    scheduleMailSettingsServerSync();
    return readLocalMailSyncedSettings();
  }

  const pulled = await pullMailSyncedSettings(calendarApiService, cipher);
  if (pulled.status === "missing") scheduleMailSettingsServerSync();
  if (pulled.status !== "loaded" || isMailSettingsSyncPending()) {
    return readLocalMailSyncedSettings();
  }
  return writeLocalMailSyncedSettings(pulled.settings);
}
