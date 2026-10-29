import {
  createMailboxNameCipher,
  type MailboxNameCipher,
} from "@workspace/calendar-core";
import { getActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";
import { getMailE2eeModule } from "./vault-secret";

export async function getMailboxNameCipher(): Promise<MailboxNameCipher | null> {
  const session = getActiveE2eeSession();
  const e2ee = await getMailE2eeModule();
  return session && e2ee ? createMailboxNameCipher(e2ee, session.accountKey) : null;
}
