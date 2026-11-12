import { toast } from "@workspace/ui/lib/toast";
import {
  getErrorMessage,
  runMailSendAction,
  getSimpleLoginForward,
  resolveMessageReplyFrom,
  sealMailForSelf,
  SIMPLELOGIN_DONE_KEYWORD,
  type MailKeywordEdit,
  type SimpleLoginActionMode,
} from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import {
  createMailSealer,
  getPrimaryMailboxId,
  type ActiveMailboxState,
} from "@/lib/mail/mail-app-helpers";
import { getPrimaryMailAccountId } from "@/lib/mail/jmap-client";
import type { JmapEmailMessage } from "@/lib/mail/types";

const log = createLogger("simplelogin-alias-action");

export function useSimpleLoginAliasAction({
  activeMailbox,
  patchMessageKeyword,
  trackKeywordWrite,
}: {
  activeMailbox: ActiveMailboxState | null;
  /** Keeps the done mark from being undone by a server answer read before its write settles. */
  trackKeywordWrite: (
    edits: MailKeywordEdit[],
    write: () => Promise<void>,
  ) => Promise<void>;
  patchMessageKeyword: (
    message: JmapEmailMessage,
    keyword: string,
    enabled: boolean,
  ) => void;
}) {
  return async (message: JmapEmailMessage, mode: SimpleLoginActionMode = "run") => {
    const action = getSimpleLoginForward(message)?.action;
    if (!activeMailbox || !action) return;
    const { client, session, identities, mailboxes } = activeMailbox;
    const doneEdit = (enabled: boolean): MailKeywordEdit[] => [
      { messageId: message.id, keyword: SIMPLELOGIN_DONE_KEYWORD, enabled },
    ];

    const openAndMark = async (url: string, done: boolean) => {
      window.open(url, "_blank", "noopener,noreferrer");
      patchMessageKeyword(message, SIMPLELOGIN_DONE_KEYWORD, done);
      try {
        await trackKeywordWrite(doneEdit(done), () =>
          client.setMessageKeyword(session, message.id, SIMPLELOGIN_DONE_KEYWORD, done),
        );
      } catch (error) {
        log.error("Failed to update SimpleLogin action state", error);
        patchMessageKeyword(message, SIMPLELOGIN_DONE_KEYWORD, !done);
      }
    };

    if (mode === "undo") {
      if (action.undo) await openAndMark(action.undo.url, false);
      return;
    }
    if (action.target.type === "https") {
      await openAndMark(action.target.url, true);
      return;
    }

    const replyFrom = resolveMessageReplyFrom(identities, message);
    const identity = identities.find((entry) => entry.id === replyFrom?.identityId);
    const draftsMailboxId = getPrimaryMailboxId(mailboxes, "drafts");
    if (!identity || !draftsMailboxId) {
      toast.error("Could not find the address this message was sent to.");
      return;
    }

    const toastId = toast.loading(action.pendingLabel);
    patchMessageKeyword(message, SIMPLELOGIN_DONE_KEYWORD, true);
    // SimpleLogin only honours the command from the mailbox it forwards to, so it goes out from the receiving identity.
    const target = action.target;
    let sent = false;
    // The mark shows from now but is written only after the send, so the whole span counts as one write in flight.
    const sendThenMark = async () => {
      const accountId = getPrimaryMailAccountId(session);
      if (!accountId) throw new Error("Your mailbox is not connected.");
      await runMailSendAction(accountId, `simplelogin:${message.id}`, async (sendScope, isActionCurrent) => {
        await client.ensureEncryptOnAppendDisabled(session);
        const sealer = createMailSealer(activeMailbox);
        const sentCopyCiphertext = await sealMailForSelf({ text: target.body }, sealer);
        if (!isActionCurrent()) throw new Error("This mail action was closed before sending.");
        await client.sendMessage(session, {
          isCurrent: sealer.isCurrent,
          sendScope,
          draftsMailboxId,
          sentMailboxId: getPrimaryMailboxId(mailboxes, "sent"),
          fromEmail: identity.email,
          fromName: identity.name,
          to: [target.to],
          subject: target.subject,
          textBody: target.body,
          identityId: identity.id,
          sentCopyCiphertext,
        });
      });
      sent = true;
      toast.success(action.doneLabel, { id: toastId });
      await client.setMessageKeyword(session, message.id, SIMPLELOGIN_DONE_KEYWORD, true);
    };
    try {
      await trackKeywordWrite(doneEdit(true), sendThenMark);
    } catch (error) {
      if (sent) {
        log.error("Failed to mark SimpleLogin action done", error);
        return;
      }
      log.error("Failed to run SimpleLogin action", error);
      patchMessageKeyword(message, SIMPLELOGIN_DONE_KEYWORD, false);
      toast.error(getErrorMessage(error, "Could not reach SimpleLogin."), { id: toastId });
    }
  };
}
