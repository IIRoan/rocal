import { toast } from "@workspace/ui/lib/toast";
import {
  getErrorMessage,
  getMailUnsubscribe,
  MAIL_UNSUBSCRIBE_LABELS,
  MAIL_UNSUBSCRIBED_KEYWORD,
  resolveMessageReplyFrom,
  type MailKeywordEdit,
} from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import type { ActiveMailboxState } from "@/lib/mail/mail-app-helpers";
import { mailUnsubscribeHandoffUrl } from "@/lib/mail/mail-link-handoff";
import { sendMailCommand } from "@/lib/mail/send-mail-command";
import type { JmapEmailMessage } from "@/lib/mail/types";

const log = createLogger("mail-unsubscribe-action");

/** One-click goes to `/mail/link`, whose form posts it from this device, then the mailto command, then the sender's page; never through the API. */
export function useMailUnsubscribeAction({
  activeMailbox,
  patchMessageKeyword,
  trackKeywordWrite,
}: {
  activeMailbox: ActiveMailboxState | null;
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
  return async (message: JmapEmailMessage) => {
    if (!activeMailbox) return;
    const replyFrom = resolveMessageReplyFrom(activeMailbox.identities, message);
    const unsubscribe = getMailUnsubscribe(message, {
      allowOneClick: true,
      allowMailto: replyFrom !== null,
    });
    if (!unsubscribe) return;
    const address =
      activeMailbox.identities.find((identity) => identity.id === replyFrom?.identityId)?.email ?? "";
    const { client, session } = activeMailbox;
    const toastId = toast.loading(MAIL_UNSUBSCRIBE_LABELS.pending);
    patchMessageKeyword(message, MAIL_UNSUBSCRIBED_KEYWORD, true);
    let done = false;
    // The mark shows from now but is written only after the unsubscribe, so the whole span counts as one write in flight.
    const unsubscribeThenMark = async () => {
      let failure: unknown = null;
      for (const target of unsubscribe.targets) {
        try {
          if (target.type === "mailto") {
            await sendMailCommand(activeMailbox, message, `unsubscribe:${message.id}`, target);
          } else if (target.type === "one-click") {
            window.open(mailUnsubscribeHandoffUrl(target.url, address), "_blank", "noopener,noreferrer");
          } else {
            window.open(target.url, "_blank", "noopener,noreferrer");
          }
          done = true;
          break;
        } catch (error) {
          failure = error;
        }
      }
      if (!done) throw failure;
      toast.success(MAIL_UNSUBSCRIBE_LABELS.done, { id: toastId });
      await client.setMessageKeyword(session, message.id, MAIL_UNSUBSCRIBED_KEYWORD, true);
    };
    try {
      await trackKeywordWrite(
        [{ messageId: message.id, keyword: MAIL_UNSUBSCRIBED_KEYWORD, enabled: true }],
        unsubscribeThenMark,
      );
    } catch (error) {
      if (done) {
        log.error("Failed to mark unsubscribe done", error);
        return;
      }
      log.error("Failed to unsubscribe", error);
      patchMessageKeyword(message, MAIL_UNSUBSCRIBED_KEYWORD, false);
      toast.error(getErrorMessage(error, "Couldn't unsubscribe. Try again."), { id: toastId });
    }
  };
}
