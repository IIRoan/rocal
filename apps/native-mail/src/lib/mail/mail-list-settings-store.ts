import * as SecureStore from "expo-secure-store";
import { SECURE_STORE_KEYS } from "@workspace/native-core/lib/constants";
import {
  parseMailListSettings,
  serializeMailListSettings,
  type MailListSettings,
} from "@workspace/calendar-core";

export async function loadMailListSettings(): Promise<MailListSettings> {
  return parseMailListSettings(
    await SecureStore.getItemAsync(SECURE_STORE_KEYS.MAIL_LIST_SETTINGS),
  );
}

export async function saveMailListSettings(
  settings: MailListSettings,
): Promise<void> {
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.MAIL_LIST_SETTINGS,
    serializeMailListSettings(settings),
  );
}

export async function clearMailListSettings(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.MAIL_LIST_SETTINGS).catch(
    () => undefined,
  );
}
