import { toast } from "@workspace/ui/lib/toast";
import {
  getErrorMessage,
  getMailUnsubscribe,
  getMailUnsubscribePage,
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

function openPage(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** A failed send is shown, never silently swapped for the sender's page; the page is offered instead. */
function showUnsubscribeFailure(message: JmapEmailMessage, toastId: string | number, error: unknown) {
  log.error("Failed to unsubscribe", error);
  const page = getMailUnsubscribePage(message);
  toast.error(getErrorMessage(error, MAIL_UNSUBSCRIBE_LABELS.failed), {
    id: toastId,
    action: page ? { label: MAIL_UNSUBSCRIBE_LABELS.openPage, onClick: () => openPage(page) } : undefined,
  });
}

/** One-click opens `/mail/link`, whose form the user submits from this device, and mailto is sent here; never through the API. */
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
    const target = getMailUnsubscribe(message, {
      allowOneClick: true,
      allowMailto: replyFrom !== null,
    })?.targets[0];
    if (!target) return;
    // Opened inside the click so no popup blocker stops it; neither page reports back, so nothing is marked done.
    if (target.type !== "mailto") {
      const address =
        activeMailbox.identities.find((identity) => identity.id === replyFrom?.identityId)?.email ?? "";
      openPage(target.type === "one-click" ? mailUnsubscribeHandoffUrl(target.url, address) : target.url);
      return;
    }
    const { client, session } = activeMailbox;
    const toastId = toast.loading(MAIL_UNSUBSCRIBE_LABELS.pending);
    try {
      await sendMailCommand(activeMailbox, message, `unsubscribe:${message.id}`, target);
    } catch (error) {
      showUnsubscribeFailure(message, toastId, error);
      return;
    }
    toast.success(MAIL_UNSUBSCRIBE_LABELS.done, { id: toastId });
    patchMessageKeyword(message, MAIL_UNSUBSCRIBED_KEYWORD, true);
    await trackKeywordWrite(
      [{ messageId: message.id, keyword: MAIL_UNSUBSCRIBED_KEYWORD, enabled: true }],
      () => client.setMessageKeyword(session, message.id, MAIL_UNSUBSCRIBED_KEYWORD, true),
    ).catch((error: unknown) => log.error("Failed to mark unsubscribe done", error));
  };
}
