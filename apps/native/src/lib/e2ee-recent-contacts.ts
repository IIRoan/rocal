import type { E2eeModule } from "@workspace/e2ee";
import {
  createEmptyRecentContactsPayload,
  type RecentContactsPayload,
} from "@workspace/calendar-core";
import { calendarApiService } from "./api";

const ENCRYPTION_KEY_VERSION = 1;
const RECENT_CONTACTS_AAD = `recent-contacts:v${ENCRYPTION_KEY_VERSION}`;

function parseEncryptedPayload(encryptedContent: string) {
  try {
    return JSON.parse(encryptedContent) as {
      version: number;
      algorithm: "AES-GCM";
      iv: string;
      ciphertext: string;
    };
  } catch {
    return null;
  }
}

export async function loadRecentContactsCrypto(
  accountKey: CryptoKey,
  e2ee: E2eeModule,
): Promise<RecentContactsPayload | null> {
  const record = await calendarApiService.getRecentContacts();
  if (!record) {
    return createEmptyRecentContactsPayload();
  }

  const encryptedPayload = parseEncryptedPayload(record.encryptedContent);
  if (!encryptedPayload) {
    return createEmptyRecentContactsPayload();
  }

  try {
    return await e2ee.decryptJsonPayload<RecentContactsPayload>(
      accountKey,
      encryptedPayload,
      RECENT_CONTACTS_AAD,
    );
  } catch {
    return createEmptyRecentContactsPayload();
  }
}

export async function saveRecentContactsCrypto(
  accountKey: CryptoKey,
  e2ee: E2eeModule,
  payload: RecentContactsPayload,
): Promise<boolean> {
  const encrypted = await e2ee.encryptJsonPayload(
    accountKey,
    payload,
    RECENT_CONTACTS_AAD,
  );

  await calendarApiService.putRecentContacts({
    encryptedContent: JSON.stringify(encrypted),
    encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
  });

  return true;
}
