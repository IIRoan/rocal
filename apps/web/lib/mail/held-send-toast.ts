import {
  CANCELED_SEND_IN_SENT_NOTICE,
  formatScheduledSendTime,
  type HeldSubmissionCancelResult,
  type MailSendHold,
  type TimeFormat,
} from "@workspace/calendar-core";
import { toast } from "@workspace/ui/lib/toast";

const TOO_LATE = "Too late to undo. The message was sent.";

/** Shows "Sending…" with Undo for an undo window, or the scheduled time; Undo cancels and hands back the sealed copy. */
export function announceHeldSend(input: {
  hold: MailSendHold;
  submissionId: string;
  sentMessage: string;
  timezone: string;
  timeFormat: TimeFormat;
  cancel: () => Promise<HeldSubmissionCancelResult>;
  moveToDrafts: () => Promise<void>;
  onCanceled: () => void;
}): void {
  const id = `held-send-${input.submissionId}`;
  const isUndoWindow = "forSeconds" in input.hold;
  let settled = false;
  const undo = async () => {
    settled = true;
    toast.loading("Canceling…", { id, action: undefined });
    const result = await input.cancel().catch(() => null);
    if (result === "canceled") {
      toast(isUndoWindow ? "Sending canceled." : "Moved to Drafts.", { id, duration: 4000 });
      input.onCanceled();
    } else if (result === "canceledInSent") {
      announceCopyInSent(id, input.moveToDrafts);
      input.onCanceled();
    } else if (result === "sent") {
      toast(TOO_LATE, { id, duration: 4000 });
    } else {
      toast.error("Could not cancel the send.", { id });
    }
  };
  const action = {
    label: "Undo",
    onClick: () => {
      undo().catch(() => toast.error("Could not cancel the send.", { id }));
    },
  };
  if ("forSeconds" in input.hold) {
    toast("Sending…", { id, action });
    setTimeout(() => {
      if (!settled) toast(input.sentMessage, { id, action: undefined, duration: 4000 });
    }, input.hold.forSeconds * 1000);
    return;
  }
  toast(`Scheduled for ${formatScheduledSendTime(input.hold.until, input.timezone, input.timeFormat)}.`, { id, action });
}

/** The send is canceled but its copy stayed in Sent; Retry moves it to Drafts again. */
export function announceCopyInSent(id: string, moveToDrafts: () => Promise<void>): void {
  const retry = () => {
    toast.loading("Moving to Drafts…", { id, action: undefined });
    moveToDrafts().then(
      () => toast("Moved to Drafts.", { id, duration: 4000 }),
      () => announceCopyInSent(id, moveToDrafts),
    );
  };
  toast.error(CANCELED_SEND_IN_SENT_NOTICE, { id, action: { label: "Retry", onClick: retry } });
}
