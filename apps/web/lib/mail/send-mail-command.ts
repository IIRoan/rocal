import {
  resolveMessageReplyFrom,
  sendJmapMailCommand,
  type MailCommand,
} from "@workspace/calendar-core";
import {
  createMailSealer,
  getPrimaryMailboxId,
  type ActiveMailboxState,
} from "@/lib/mail/mail-app-helpers";
import { getPrimaryMailAccountId } from "@/lib/mail/jmap-client";
import type { JmapEmailMessage } from "@/lib/mail/types";

/** Sends a list or alias command from the address the message was delivered to, which is the one the list honours. */
export async function sendMailCommand(
  activeMailbox: ActiveMailboxState,
  message: JmapEmailMessage,
  actionId: string,
  command: MailCommand,
): Promise<void> {
  const { client, session, identities, mailboxes } = activeMailbox;
  const replyFrom = resolveMessageReplyFrom(identities, message);
  const identity = identities.find((entry) => entry.id === replyFrom?.identityId);
  const draftsMailboxId = getPrimaryMailboxId(mailboxes, "drafts");
  if (!identity || !draftsMailboxId) {
    throw new Error("Could not find the address this message was sent to.");
  }
  await sendJmapMailCommand(
    {
      client,
      session,
      accountId: getPrimaryMailAccountId(session),
      createSealer: () => createMailSealer(activeMailbox),
    },
    {
      identityId: identity.id,
      fromEmail: identity.email,
      fromName: identity.name,
      draftsMailboxId,
      sentMailboxId: getPrimaryMailboxId(mailboxes, "sent"),
    },
    actionId,
    command,
  );
}
