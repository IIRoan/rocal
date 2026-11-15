"use client";

import {
  formatScheduledSendTime,
  getErrorMessage,
  resolveTimezone,
  SCHEDULED_SEND_CANCELED_NOTICE,
  type ScheduledMailSend,
} from "@workspace/calendar-core";
import { toast } from "@workspace/ui/lib/toast";
import type { MailConnection } from "@/hooks/use-mail-vacation-response";
import { useScheduledMailSends } from "@/hooks/use-scheduled-mail-sends";
import { useUserTimeFormat } from "@/hooks/use-user-time-format";
import { getDraftsMailboxId } from "@/lib/mail/draft-utils";
import type { JmapMailbox } from "@/lib/mail/types";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteView,
} from "../command-palette/palette-ui";

export function ScheduledSendsPanel({
  goBack,
  connection,
  userId,
  mailboxes,
  timezone,
}: {
  goBack: () => void;
  connection: MailConnection | null;
  userId: string | null;
  mailboxes: JmapMailbox[];
  timezone?: string | null;
}) {
  const scheduled = useScheduledMailSends(connection, userId, getDraftsMailboxId(mailboxes));
  const timeFormat = useUserTimeFormat();
  const zone = resolveTimezone(timezone);

  const cancel = (send: ScheduledMailSend) => {
    scheduled.cancel(send).then(
      (result) => {
        toast(result === "canceled" ? SCHEDULED_SEND_CANCELED_NOTICE : "Too late to cancel. The message was sent.");
      },
      (error: unknown) => toast.error(getErrorMessage(error, "Couldn't cancel the scheduled send.")),
    );
  };

  return (
    <PaletteView title="Scheduled" onBack={goBack}>
      {scheduled.loading ? (
        <PaletteEmptyState>Loading scheduled mail…</PaletteEmptyState>
      ) : scheduled.loadError ? (
        <PaletteEmptyState>{getErrorMessage(scheduled.loadError, "Couldn't load scheduled mail.")}</PaletteEmptyState>
      ) : scheduled.sends.length === 0 ? (
        <PaletteEmptyState>No scheduled mail.</PaletteEmptyState>
      ) : (
        <ul className="flex flex-col">
          {scheduled.sends.map((send) => (
            <li key={send.submissionId} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] leading-[130%] text-foreground">
                  {send.subject || "(no subject)"}
                </span>
                <span className="truncate text-[13px] leading-[130%] text-muted-foreground">
                  {send.recipients.join(", ")}
                </span>
                <span className="text-[13px] leading-[130%] text-muted-foreground">
                  {formatScheduledSendTime(send.sendAt, zone, timeFormat)}
                </span>
              </div>
              <PaletteButton
                loading={scheduled.cancelingId === send.submissionId}
                onClick={() => cancel(send)}
              >
                Cancel and move to Drafts
              </PaletteButton>
            </li>
          ))}
        </ul>
      )}
    </PaletteView>
  );
}
