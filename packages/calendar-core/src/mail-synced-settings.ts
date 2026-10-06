import {
  DEFAULT_MAIL_COMPOSE_SETTINGS,
  normalizeMailComposeSettings,
  type MailComposeSettings,
} from "./mail-compose-settings";
import {
  DEFAULT_MAIL_DISPLAY_SETTINGS,
  normalizeMailDisplaySettings,
  type MailDisplaySettings,
} from "./mail-display-settings";
import {
  DEFAULT_MAIL_LIST_SETTINGS,
  normalizeMailListSettings,
  type MailListSettings,
} from "./mail-list-settings";
import type { PutMailSettingsRequest } from "./route-schemas";
import type { MailSettingsRecord } from "./types";

/** Mail prefs that sync across devices as an encrypted blob; app chrome theme stays per-device. */
export type MailSyncedSettings = {
  display: MailDisplaySettings;
  compose: MailComposeSettings;
  list: MailListSettings;
};

export const MAIL_SYNCED_SETTINGS_ENCRYPTION_KEY_VERSION = 1;
export const MAIL_SYNCED_SETTINGS_AAD = `mail-settings:v${MAIL_SYNCED_SETTINGS_ENCRYPTION_KEY_VERSION}`;

export const DEFAULT_MAIL_SYNCED_SETTINGS: MailSyncedSettings = {
  display: DEFAULT_MAIL_DISPLAY_SETTINGS,
  compose: DEFAULT_MAIL_COMPOSE_SETTINGS,
  list: DEFAULT_MAIL_LIST_SETTINGS,
};

export function createDefaultMailSyncedSettings(): MailSyncedSettings {
  return {
    display: { ...DEFAULT_MAIL_DISPLAY_SETTINGS, trustedSenders: [] },
    compose: {
      ...DEFAULT_MAIL_COMPOSE_SETTINGS,
      attachmentReminderKeywords: [
        ...DEFAULT_MAIL_COMPOSE_SETTINGS.attachmentReminderKeywords,
      ],
    },
    list: { ...DEFAULT_MAIL_LIST_SETTINGS },
  };
}

export function sanitizeMailSyncedSettings(input: unknown): MailSyncedSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createDefaultMailSyncedSettings();
  }
  const parsed = input as Record<string, unknown>;
  return {
    display: normalizeMailDisplaySettings(parsed.display),
    compose: normalizeMailComposeSettings(parsed.compose),
    list: normalizeMailListSettings(parsed.list),
  };
}

export interface MailSettingsApi {
  getMailSettings(): Promise<MailSettingsRecord | null>;
  putMailSettings(request: PutMailSettingsRequest): Promise<unknown>;
}

export interface MailSettingsCipher {
  encrypt(settings: MailSyncedSettings): Promise<string>;
  decrypt(encryptedContent: string): Promise<unknown>;
}

export function createMailSettingsCipher<Key, Payload>(
  e2ee: {
    encryptJsonPayload(key: Key, payload: unknown, aad?: string): Promise<Payload>;
    decryptJsonPayload<T>(key: Key, payload: Payload, aad?: string): Promise<T>;
  },
  accountKey: Key,
): MailSettingsCipher {
  return {
    encrypt: async (settings) =>
      JSON.stringify(
        await e2ee.encryptJsonPayload(accountKey, settings, MAIL_SYNCED_SETTINGS_AAD),
      ),
    decrypt: async (encryptedContent) => {
      // repo-rules-allow typescript-untrusted-input: re-parse of the envelope this cipher serialized; AES-GCM auth inside decryptJsonPayload rejects tampering and callers catch failures.
      const envelope = JSON.parse(encryptedContent) as Payload;
      return e2ee.decryptJsonPayload<unknown>(
        accountKey,
        envelope,
        MAIL_SYNCED_SETTINGS_AAD,
      );
    },
  };
}

export type MailSyncedSettingsPull =
  | { status: "loaded"; settings: MailSyncedSettings }
  | { status: "missing" }
  | { status: "unavailable" };

/** "unavailable" (offline, undecryptable) tells callers to keep local prefs and never overwrite the server copy. */
export async function pullMailSyncedSettings(
  api: MailSettingsApi,
  cipher: MailSettingsCipher,
): Promise<MailSyncedSettingsPull> {
  let record: MailSettingsRecord | null;
  try {
    record = await api.getMailSettings();
  } catch {
    return { status: "unavailable" };
  }
  if (!record) return { status: "missing" };
  try {
    const decrypted = await cipher.decrypt(record.encryptedContent);
    return { status: "loaded", settings: sanitizeMailSyncedSettings(decrypted) };
  } catch {
    return { status: "unavailable" };
  }
}

export async function pushMailSyncedSettings(
  api: MailSettingsApi,
  cipher: MailSettingsCipher,
  settings: MailSyncedSettings,
): Promise<void> {
  await api.putMailSettings({
    encryptedContent: await cipher.encrypt(sanitizeMailSyncedSettings(settings)),
    encryptionKeyVersion: MAIL_SYNCED_SETTINGS_ENCRYPTION_KEY_VERSION,
  });
}

export function assembleMailSyncedSettings(parts: {
  display?: MailDisplaySettings | null;
  compose?: MailComposeSettings | null;
  list?: MailListSettings | null;
}): MailSyncedSettings {
  return {
    display: parts.display ?? createDefaultMailSyncedSettings().display,
    compose: parts.compose ?? createDefaultMailSyncedSettings().compose,
    list: parts.list ?? createDefaultMailSyncedSettings().list,
  };
}
