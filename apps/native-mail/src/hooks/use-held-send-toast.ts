import { useQueryClient } from "@tanstack/react-query";
import {
  CANCELED_SEND_IN_SENT_NOTICE,
  formatScheduledSendTime,
  type MailSendHold,
  type SentJmapMessage,
} from "@workspace/calendar-core";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import type { ComposeRequest } from "../lib/mail/compose-request";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { useMailListSettings } from "./use-mail-list-settings";

/** The send is canceled but its copy stayed in Sent; Retry moves it to Drafts again. */
export function useCopyInSentToast() {
  const { toast } = useToast();
  const announce = (moveToDrafts: () => Promise<void>) => {
    const retry = () => {
      moveToDrafts().then(
        () => toast("Moved to Drafts.", "success"),
        () => announce(moveToDrafts),
      );
    };
    toast(CANCELED_SEND_IN_SENT_NOTICE, "error", { action: { label: "Retry", onPress: retry } });
  };
  return announce;
}

/** "Sending…" or "Scheduled for …" with Undo: cancels the hold and reopens compose from the form that was sent. */
export function useHeldSendToast(
  runtime: MailRuntime | undefined,
  openCompose: (request: ComposeRequest) => void,
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const { settings } = useMailListSettings();
  const announceCopyInSent = useCopyInSentToast();

  const undo = async (receipt: SentJmapMessage, reopen: ComposeRequest) => {
    const draftsMailboxId = runtime?.mailboxes.find((mailbox) => mailbox.role === "drafts")?.id;
    if (!runtime || !draftsMailboxId) throw new Error("Your mailbox is not connected.");
    const result = await runtime.client.cancelHeldSubmission(runtime.session, {
      submissionId: receipt.submissionId,
      copyEmailId: receipt.emailId,
      draftsMailboxId,
    });
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mailScheduledSends() });
    if (result === "sent") {
      toast("Too late to undo. The message was sent.", "info");
      return;
    }
    if (result === "canceledInSent") {
      announceCopyInSent(() =>
        runtime.client.moveCanceledSendToDrafts(runtime.session, { copyEmailId: receipt.emailId, draftsMailboxId }),
      );
    }
    openCompose(reopen);
  };

  return ({ hold, receipt, reopen }: { hold: MailSendHold; receipt: SentJmapMessage; reopen: ComposeRequest }) => {
    const action = {
      label: "Undo",
      onPress: () => {
        undo(receipt, reopen).catch(() => toast("Could not cancel the send.", "error"));
      },
    };
    if ("forSeconds" in hold) {
      toast("Sending…", "success", { duration: hold.forSeconds * 1000, action });
      return;
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mailScheduledSends() }).catch(() => undefined);
    toast(`Scheduled for ${formatScheduledSendTime(hold.until, timezone, timeFormat)}`, "success", {
      duration: settings.undoToastDurationMs,
      action,
    });
  };
}
