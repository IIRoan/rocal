import {
  createEmptyRecentContactsPayload,
  recordRecentContactUsage,
  sanitizeRecentContactsPayload,
  type RecentContactContext,
  type RecentContactUsageInput,
  type RecentContactsPayload,
} from "@workspace/calendar-core";
import { waitForPendingE2eeBootstrap } from "./e2ee-bootstrap";
import {
  decryptJsonPayload,
  encryptJsonPayload,
  type EncryptedJsonPayload,
} from "./e2ee-crypto";
import { getActiveE2eeSession } from "./e2ee-session";
import { calendarApiService } from "./calendar-api-service";

const ENCRYPTION_KEY_VERSION = 1;
const RECENT_CONTACTS_AAD = `recent-contacts:v${ENCRYPTION_KEY_VERSION}`;

async function getEncryptionSession() {
  let session = getActiveE2eeSession();

  if (session) {
    return session;
  }

  const pendingBootstrap = waitForPendingE2eeBootstrap();
  if (pendingBootstrap) {
    await pendingBootstrap.catch(() => undefined);
    session = getActiveE2eeSession();
  }

  return session;
}

function parseEncryptedPayload(
  encryptedContent: string,
): EncryptedJsonPayload | null {
  try {
    return JSON.parse(encryptedContent) as EncryptedJsonPayload;
  } catch {
    return null;
  }
}

export async function loadRecentContacts(): Promise<RecentContactsPayload | null> {
  const session = await getEncryptionSession();
  if (!session) {
    return null;
  }

  const record = await calendarApiService.getRecentContacts();
  if (!record) {
    return createEmptyRecentContactsPayload();
  }

  const encryptedPayload = parseEncryptedPayload(record.encryptedContent);
  if (!encryptedPayload) {
    return createEmptyRecentContactsPayload();
  }

  try {
    const decrypted = await decryptJsonPayload<RecentContactsPayload>(
      session.accountKey,
      encryptedPayload,
      RECENT_CONTACTS_AAD,
    );
    return sanitizeRecentContactsPayload(decrypted);
  } catch {
    return createEmptyRecentContactsPayload();
  }
}

export async function saveRecentContacts(
  payload: RecentContactsPayload,
): Promise<boolean> {
  const session = await getEncryptionSession();
  if (!session) {
    return false;
  }

  const encrypted = await encryptJsonPayload(
    session.accountKey,
    sanitizeRecentContactsPayload(payload),
    RECENT_CONTACTS_AAD,
  );

  await calendarApiService.putRecentContacts({
    encryptedContent: JSON.stringify(encrypted),
    encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
  });

  return true;
}

export async function recordRecentContacts(
  entries: RecentContactUsageInput[],
  context: RecentContactContext,
): Promise<RecentContactsPayload | null> {
  if (entries.length === 0) {
    return null;
  }

  const current = await loadRecentContacts();
  if (!current) {
    return null;
  }

  const next = recordRecentContactUsage(current, entries, context);
  const saved = await saveRecentContacts(next);
  return saved ? next : null;
}
