import {
  createMailboxNameCipher,
  type MailboxNameCipher,
} from "@workspace/calendar-core";
import { decryptJsonPayload, encryptJsonPayload } from "@/lib/e2ee-crypto";
import { getActiveE2eeSession } from "@/lib/e2ee-session";

export async function getMailboxNameCipher(): Promise<MailboxNameCipher | null> {
  const session = getActiveE2eeSession();
  return session
    ? createMailboxNameCipher({ encryptJsonPayload, decryptJsonPayload }, session.accountKey)
    : null;
}
