import {
  formatScheduledSendTime,
  getErrorMessage,
  SCHEDULED_SEND_CANCELED_NOTICE,
  type ScheduledMailSend,
} from "@workspace/calendar-core";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import {
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useCopyInSentToast } from "../../hooks/use-held-send-toast";
import { useScheduledMailSends } from "../../hooks/use-scheduled-mail-sends";

/** Scheduled sends with a cancel that moves each back to Drafts. */
export function MailScheduledContent() {
  const scheduled = useScheduledMailSends();
  const { toast } = useToast();
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const announceCopyInSent = useCopyInSentToast();

  const cancel = (send: ScheduledMailSend) => {
    scheduled.cancel(send).then(
      (result) => {
        if (result === "canceledInSent") {
          announceCopyInSent(() => scheduled.moveToDrafts(send));
          return;
        }
        toast(result === "canceled" ? SCHEDULED_SEND_CANCELED_NOTICE : "Too late to cancel. The message was sent.", "info");
      },
      (error: unknown) => toast(getErrorMessage(error, "Couldn't cancel the scheduled send."), "error"),
    );
  };

  return (
    <SheetScroll>
      {scheduled.loading ? (
        <SheetSection>
          <SheetMessage text="Loading scheduled mail…" />
        </SheetSection>
      ) : scheduled.loadError ? (
        <SheetSection>
          <SheetMessage text={getErrorMessage(scheduled.loadError, "Couldn't load scheduled mail.")} tone="destructive" />
        </SheetSection>
      ) : scheduled.sends.length === 0 ? (
        <SheetSection>
          <SheetMessage text="No scheduled mail." />
        </SheetSection>
      ) : (
        scheduled.sends.map((send) => (
          <SheetSection key={send.submissionId} title={formatScheduledSendTime(send.sendAt, timezone, timeFormat)}>
            <SheetGroup>
              <SheetItem icon="clock" label={send.subject || "(no subject)"} detail={send.recipients.join(", ")} />
              <SheetItem
                icon="x-circle"
                label="Cancel and move to Drafts"
                tone="destructive"
                pending={scheduled.cancelingId === send.submissionId}
                disabled={scheduled.cancelingId !== null}
                onPress={() => cancel(send)}
              />
            </SheetGroup>
          </SheetSection>
        ))
      )}
    </SheetScroll>
  );
}
