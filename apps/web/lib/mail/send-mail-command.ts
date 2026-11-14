import {
  resolveMessageReplyFrom,
  runMailSendAction,
  sealMailForSelf,
} from "@workspace/calendar-core";
import {
  createMailSealer,
  getPrimaryMailboxId,
  type ActiveMailboxState,
} from "@/lib/mail/mail-app-helpers";
import { getPrimaryMailAccountId } from "@/lib/mail/jmap-client";
import type { JmapEmailMessage } from "@/lib/mail/types";

export type MailCommand = { to: string; subject: string; body: string };

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
  const accountId = getPrimaryMailAccountId(session);
  if (!accountId) throw new Error("Your mailbox is not connected.");
  await runMailSendAction(accountId, actionId, async (sendScope, isActionCurrent) => {
    await client.ensureEncryptOnAppendDisabled(session);
    const sealer = createMailSealer(activeMailbox);
    const sentCopyCiphertext = await sealMailForSelf({ text: command.body }, sealer);
    if (!isActionCurrent()) throw new Error("This mail action was closed before sending.");
    await client.sendMessage(session, {
      isCurrent: sealer.isCurrent,
      sendScope,
      draftsMailboxId,
      sentMailboxId: getPrimaryMailboxId(mailboxes, "sent"),
      fromEmail: identity.email,
      fromName: identity.name,
      to: [command.to],
      subject: command.subject,
      textBody: command.body,
      identityId: identity.id,
      sentCopyCiphertext,
    });
  });
}
