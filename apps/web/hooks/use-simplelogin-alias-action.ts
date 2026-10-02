import { useCallback } from "react";
import { toast } from "sonner";
import {
  getErrorMessage,
  getSimpleLoginForward,
  resolveMessageReplyFrom,
  SIMPLELOGIN_DONE_KEYWORD,
  type SimpleLoginActionMode,
} from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import {
  getPrimaryMailboxId,
  type ActiveMailboxState,
} from "@/lib/mail/mail-app-helpers";
import type { JmapEmailMessage } from "@/lib/mail/types";

const log = createLogger("simplelogin-alias-action");

export function useSimpleLoginAliasAction({
  activeMailbox,
  patchMessageKeyword,
}: {
  activeMailbox: ActiveMailboxState | null;
  patchMessageKeyword: (
    message: JmapEmailMessage,
    keyword: string,
    enabled: boolean,
  ) => void;
}) {
  return useCallback(
    async (message: JmapEmailMessage, mode: SimpleLoginActionMode = "run") => {
      const action = getSimpleLoginForward(message)?.action;
      if (!activeMailbox || !action) return;
      const { client, session, identities, mailboxes } = activeMailbox;

      const openAndMark = async (url: string, done: boolean) => {
        window.open(url, "_blank", "noopener,noreferrer");
        patchMessageKeyword(message, SIMPLELOGIN_DONE_KEYWORD, done);
        try {
          await client.setMessageKeyword(session, message.id, SIMPLELOGIN_DONE_KEYWORD, done);
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
      try {
        // SimpleLogin only honours the command from the mailbox it forwards to, so it goes out from the receiving identity.
        await client.ensureEncryptOnAppendDisabled(session);
        await client.sendMessage(session, {
          draftsMailboxId,
          sentMailboxId: getPrimaryMailboxId(mailboxes, "sent"),
          fromEmail: identity.email,
          fromName: identity.name,
          to: [action.target.to],
          subject: action.target.subject,
          textBody: action.target.body,
          identityId: identity.id,
        });
      } catch (error) {
        log.error("Failed to run SimpleLogin action", error);
        patchMessageKeyword(message, SIMPLELOGIN_DONE_KEYWORD, false);
        toast.error(getErrorMessage(error, "Could not reach SimpleLogin."), { id: toastId });
        return;
      }
      toast.success(action.doneLabel, { id: toastId });
      try {
        await client.setMessageKeyword(session, message.id, SIMPLELOGIN_DONE_KEYWORD, true);
      } catch (error) {
        log.error("Failed to mark SimpleLogin action done", error);
      }
    },
    [activeMailbox, patchMessageKeyword],
  );
}
