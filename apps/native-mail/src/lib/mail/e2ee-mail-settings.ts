import type { E2eeModule } from "@workspace/e2ee";
import {
  assembleMailSyncedSettings,
  createMailSettingsCipher,
  pullMailSyncedSettings,
  pushMailSyncedSettings,
  sanitizeMailSyncedSettings,
  type MailSyncedSettings,
} from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import {
  loadMailComposeSettings,
  loadMailDisplaySettings,
  saveMailComposeSettings,
  saveMailDisplaySettings,
} from "./mail-settings-store";
import {
  loadMailListSettings,
  saveMailListSettings,
} from "./mail-list-settings-store";

export async function readLocalMailSyncedSettings(): Promise<MailSyncedSettings> {
  const [display, compose, list] = await Promise.all([
    loadMailDisplaySettings(),
    loadMailComposeSettings(),
    loadMailListSettings(),
  ]);
  return assembleMailSyncedSettings({ display, compose, list });
}

export async function writeLocalMailSyncedSettings(
  settings: MailSyncedSettings,
): Promise<MailSyncedSettings> {
  const sanitized = sanitizeMailSyncedSettings(settings);
  await Promise.all([
    saveMailDisplaySettings(sanitized.display),
    saveMailComposeSettings(sanitized.compose),
    saveMailListSettings(sanitized.list),
  ]);
  return sanitized;
}

/** Server copy when readable; this device's prefs otherwise, uploaded only when the server has none. */
export async function loadMailSyncedSettingsCrypto(
  accountKey: CryptoKey,
  e2ee: E2eeModule,
): Promise<MailSyncedSettings> {
  const cipher = createMailSettingsCipher(e2ee, accountKey);
  const pulled = await pullMailSyncedSettings(calendarApiService, cipher);
  if (pulled.status === "loaded") {
    return writeLocalMailSyncedSettings(pulled.settings);
  }
  const local = await readLocalMailSyncedSettings();
  if (pulled.status === "missing") {
    await pushMailSyncedSettings(calendarApiService, cipher, local).catch(
      () => undefined,
    );
  }
  return local;
}

export async function saveMailSyncedSettingsCrypto(
  accountKey: CryptoKey,
  e2ee: E2eeModule,
  settings: MailSyncedSettings,
): Promise<MailSyncedSettings> {
  await pushMailSyncedSettings(
    calendarApiService,
    createMailSettingsCipher(e2ee, accountKey),
    settings,
  );
  return writeLocalMailSyncedSettings(settings);
}
