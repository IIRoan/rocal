import * as SecureStore from "expo-secure-store";
import { SECURE_STORE_KEYS } from "../constants";
import {
  parseHiddenMailboxIds,
  serializeHiddenMailboxIds,
} from "./hidden-mailboxes";

export async function loadHiddenMailboxIds(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(
    SECURE_STORE_KEYS.HIDDEN_MAILBOX_IDS,
  );
  return parseHiddenMailboxIds(raw);
}

export async function saveHiddenMailboxIds(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(
    SECURE_STORE_KEYS.HIDDEN_MAILBOX_IDS,
    serializeHiddenMailboxIds(ids),
  );
}
