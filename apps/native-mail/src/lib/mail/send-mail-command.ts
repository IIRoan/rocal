import { runMailSendAction, sealMailForSelf } from "@workspace/calendar-core";
import { getPrimaryMailAccountId } from "./jmap-client";
import type { MailRuntime } from "./mail-runtime";
import { createMailSealer } from "./outgoing-message-crypto";
import type { resolveComposeContext } from "./use-mail";

export type MailCommand = { to: string; subject: string; body: string };

/** Sends a list or alias command as plaintext with a self-sealed Sent copy, from the identity in `context`. */
export async function sendMailCommand(
  runtime: MailRuntime,
  context: NonNullable<ReturnType<typeof resolveComposeContext>>,
  actionId: string,
  command: MailCommand,
): Promise<void> {
  const accountId = getPrimaryMailAccountId(runtime.session);
  if (!accountId) throw new Error("Your mailbox is not connected.");
  await runMailSendAction(accountId, actionId, async (sendScope, isActionCurrent) => {
    await runtime.client.ensureEncryptOnAppendDisabled(runtime.session);
    const sealer = await createMailSealer(runtime);
    const sentCopyCiphertext = await sealMailForSelf({ text: command.body }, sealer);
    if (!isActionCurrent()) throw new Error("This mail action was closed before sending.");
    await runtime.client.sendMessage(runtime.session, {
      isCurrent: sealer.isCurrent,
      sendScope,
      draftsMailboxId: context.draftsMailboxId,
      sentMailboxId: context.sentMailboxId,
      fromEmail: context.fromEmail,
      fromName: context.fromName,
      to: [command.to],
      subject: command.subject,
      textBody: command.body,
      identityId: context.identityId,
      sentCopyCiphertext,
    });
  });
}
