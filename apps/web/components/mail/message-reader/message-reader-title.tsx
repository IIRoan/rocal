"use client";

import { CalendarDays, Star } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  Typography,
  TypographySize,
  TypographyWeight,
} from "@workspace/ui/solace";
import {
  resolveLabelDisplayColor,
  getMailSenderTrustNotice,
  MAIL_KEY_CONTINUITY_ENABLED,
  type MailThreadParticipant,
} from "@workspace/calendar-core";
import { SenderAvatar } from "../mail-avatar";
import { RecipientPopover } from "../recipient-popover";
import { MailSecurityBadge } from "./mail-security-badge";
import { MessageReaderHeaderAttachments } from "./message-reader-header-attachments";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

export function MessageReaderTitle({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { isMobile, messageLabels } = controller;
  const {
    messageState,
    orderedConversationMessages,
    threadSubject,
    threadDateRange,
    threadParticipants,
    threadAttachments,
  } = view;

  const threadCount = orderedConversationMessages.length;

  return (
    <div className="shrink-0 border-b border-[var(--border-tertiary)]">
      <div
        className={cn(
          "flex items-start justify-between gap-2",
          isMobile ? "px-3 py-2" : "min-h-14 px-4 py-[15px]",
        )}
      >
        <h2 className="min-w-0">
          <Typography
            size={isMobile ? TypographySize.SMALL : TypographySize.H3}
            weight={TypographyWeight.MEDIUM}
            wrap
          >
            {threadSubject || "(No subject)"}
            {threadCount > 1 ? (
              <span className="ml-1.5 font-normal tabular-nums text-[var(--text-secondary)]">
                [{threadCount}]
              </span>
            ) : null}
          </Typography>
        </h2>
        <MessageReaderTitleActions controller={controller} view={view} />
      </div>

      <ReaderTrustNotice controller={controller} />
      {threadCount > 1 && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1.5",
            isMobile ? "px-3 pb-2" : "-mt-1 px-4 pb-3",
          )}
        >
          {threadDateRange ? (
            <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" aria-hidden />
              {threadDateRange}
            </span>
          ) : null}
          <ThreadParticipants participants={threadParticipants} />
        </div>
      )}

      {messageLabels.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            isMobile ? "px-3 pb-2" : "px-4 pb-3",
          )}
        >
          {messageLabels.map((label) => {
            const displayColor = resolveLabelDisplayColor(label.color);
            return (
              <span
                key={label.id}
                title={label.name}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)]"
                style={{
                  backgroundColor: `color-mix(in srgb, ${displayColor} 13%, transparent)`,
                }}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: displayColor }}
                />
                {label.name}
              </span>
            );
          })}
        </div>
      )}

      {threadAttachments.length > 0 && (
        <div className={isMobile ? "px-3 pb-2" : "px-4 pb-3"}>
          <MessageReaderHeaderAttachments
            controller={controller}
            attachments={threadAttachments}
            label="In this thread"
          />
        </div>
      )}
    </div>
  );
}

const VISIBLE_PARTICIPANTS = 4;

function ThreadParticipants({
  participants,
}: {
  participants: MailThreadParticipant[];
}) {
  const hidden = participants.slice(VISIBLE_PARTICIPANTS);
  return (
    <ul
      aria-label="People in this thread"
      className="m-0 flex min-w-0 list-none flex-wrap items-center gap-1.5 p-0"
    >
      {participants.slice(0, VISIBLE_PARTICIPANTS).map((participant) => (
        <li
          key={participant.email}
          className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-overlay-tertiary)] py-0.5 pl-0.5 pr-2"
        >
          <SenderAvatar
            email={participant.email}
            name={participant.name ?? undefined}
            className="size-4 text-[8px]"
          />
          <RecipientPopover
            name={participant.isSelf ? "You" : participant.name}
            email={participant.email}
            className="max-w-40 truncate text-xs"
          />
        </li>
      ))}
      {hidden.length > 0 ? (
        <li
          title={hidden
            .map((participant) => participant.name ?? participant.email)
            .join(", ")}
          className="rounded-full bg-[var(--bg-overlay-tertiary)] px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
        >
          +{hidden.length}
        </li>
      ) : null}
    </ul>
  );
}

function ReaderTrustNotice({
  controller,
}: {
  controller: MessageReaderController;
}) {
  const { senderKeyTrustState, signatureVerificationState } = controller.props;
  const state =
    senderKeyTrustState ??
    (MAIL_KEY_CONTINUITY_ENABLED && signatureVerificationState !== "not_signed"
      ? { kind: "unavailable" as const, reason: "history" as const }
      : undefined);
  const notice = getMailSenderTrustNotice(state);
  if (!notice) return null;
  return (
    <p role="status" className="px-4 pb-2 text-xs text-destructive">
      {notice.label}. {notice.description}
    </p>
  );
}
function MessageReaderTitleActions({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { isBusy, isFlagged, props } = controller;
  return (
    <div className="mt-0.5 flex shrink-0 items-center gap-1">
      {props.onToggleFlagged ? (
        <button
          type="button"
          onClick={props.onToggleFlagged}
          disabled={isBusy}
          aria-label={isFlagged ? "Unstar" : "Star"}
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded outline-none transition-colors hover:bg-[var(--bg-overlay-tertiary)] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <Star
            className={cn(
              "size-4 transition-colors",
              isFlagged
                ? "fill-warning text-warning"
                : "text-[var(--icon-tertiary)] hover:text-warning",
            )}
            strokeWidth={2}
          />
        </button>
      ) : null}
      <MailSecurityBadge
        messageState={view.messageState}
        accountEncryptedAtRest={props.accountEncryptedAtRest}
        signatureVerificationState={props.signatureVerificationState}
        senderKeyTrustState={props.senderKeyTrustState}
        senderEmail={props.message?.from?.[0]?.email}
        decryptionFailed={Boolean(props.decryptError)}
      />
    </div>
  );
}
