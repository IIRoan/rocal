import { SECURE_STORE_KEYS } from "@workspace/native-core/lib/constants";
import {
  deleteChunkedSecureValue,
  readChunkedSecureValue,
  writeChunkedSecureValue,
} from "@workspace/native-core/lib/secure-store-chunked";
import {
  parseMailComposeSettings,
  parseMailDisplaySettings,
  serializeMailComposeSettings,
  serializeMailDisplaySettings,
  type MailComposeSettings,
  type MailDisplaySettings,
} from "@workspace/calendar-core";

export async function loadMailDisplaySettings(): Promise<MailDisplaySettings> {
  return parseMailDisplaySettings(
    await readChunkedSecureValue(SECURE_STORE_KEYS.MAIL_DISPLAY_SETTINGS),
  );
}

export async function saveMailDisplaySettings(
  settings: MailDisplaySettings,
): Promise<void> {
  await writeChunkedSecureValue(
    SECURE_STORE_KEYS.MAIL_DISPLAY_SETTINGS,
    serializeMailDisplaySettings(settings),
  );
}

export async function loadMailComposeSettings(): Promise<MailComposeSettings> {
  return parseMailComposeSettings(
    await readChunkedSecureValue(SECURE_STORE_KEYS.MAIL_COMPOSE_SETTINGS),
  );
}

export async function saveMailComposeSettings(
  settings: MailComposeSettings,
): Promise<void> {
  await writeChunkedSecureValue(
    SECURE_STORE_KEYS.MAIL_COMPOSE_SETTINGS,
    serializeMailComposeSettings(settings),
  );
}

/** Trusted senders are PII, so every local mail preference goes with the account. */
export async function clearMailSettings(): Promise<void> {
  await Promise.allSettled([
    deleteChunkedSecureValue(SECURE_STORE_KEYS.MAIL_DISPLAY_SETTINGS),
    deleteChunkedSecureValue(SECURE_STORE_KEYS.MAIL_COMPOSE_SETTINGS),
  ]);
}
