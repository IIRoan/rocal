"use client";

import { Tag } from "lucide-react";
import {
  formatDateTimeLabel,
  getSimpleLoginForward,
  resolveTimezone,
  summarizeMailRecipients,
} from "@workspace/calendar-core";
import { cn } from "@workspace/ui/lib/utils";
import { SenderAvatar } from "../mail-avatar";
import { RecipientPopover } from "../recipient-popover";
import { AuthResultsBadge } from "../auth-results-badge";
import { MessageReaderHeaderAttachments } from "./message-reader-header-attachments";
import { MessageReaderMobileActionsDrawer } from "./message-reader-mobile-actions-drawer";
import { MessageReaderRecipients, SelfTag } from "./message-reader-recipients";
import { MessageReaderSimpleLoginLine } from "./message-reader-simplelogin";
import { MessageReaderUnsubscribeLine } from "./message-reader-unsubscribe";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

export function MessageReaderHeader({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { isMobile, message, props } = controller;
  const {
    decryptError,
    timeFormat,
    timezone,
    accountEmail,
    accountName,
    identities,
  } = props;
  const { senderEmail, enrichedSender } = view;
  const recipients = summarizeMailRecipients(message, {
    email: accountEmail,
    name: accountName,
    identityEmails: identities.map((identity) => identity.email),
  });
  const date = message.receivedAt
    ? formatDateTimeLabel(new Date(message.receivedAt), resolveTimezone(timezone), timeFormat)
    : null;

  return (
    <div className={cn("flex shrink-0 flex-col", isMobile ? "gap-1.5" : "gap-3")}>
      <div className={cn("flex items-center", isMobile ? "gap-2.5" : "gap-3")}>
        <SenderAvatar
          email={senderEmail}
          name={enrichedSender.name ?? undefined}
          className={isMobile ? "size-8 text-[11px]" : "size-10"}
        />
        <MessageReaderSender
          message={message}
          sender={senderEmail ? enrichedSender : null}
          date={date}
          compact={isMobile}
        />
        <MessageReaderRecipients summary={recipients} compact={isMobile} />
      </div>
      {isMobile && recipients.selfTag ? (
        <p className="flex items-center gap-1.5 pl-[42px] text-xs text-muted-foreground">
          <Tag className="size-3 shrink-0 text-accent" strokeWidth={2.25} aria-hidden />
          to <SelfTag tag={recipients.selfTag} />
        </p>
      ) : null}
      <MessageReaderSimpleLoginLine controller={controller} />
      <MessageReaderUnsubscribeLine controller={controller} />

      <MessageReaderHeaderAttachments
        controller={controller}
        attachments={controller.displayAttachmentItems}
        label="Attachments"
      />

      {isMobile && (
        <MessageReaderMobileActionsDrawer controller={controller} view={view} />
      )}

      {decryptError && (
        <div className="mt-3 rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {decryptError}
        </div>
      )}
    </div>
  );
}

/** Name with its authentication result, then the real sending address and the date. */
function MessageReaderSender({
  message,
  sender,
  date,
  compact,
}: {
  message: MessageReaderController["message"];
  sender: { email: string; name?: string | null } | null;
  date: string | null;
  compact: boolean;
}) {
  const address = sender?.name?.trim() ? sender.email : null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {sender ? (
          <>
            <RecipientPopover
              name={sender.name}
              email={sender.email}
              className={cn("truncate font-semibold", compact ? "text-sm" : "text-[15px]")}
            />
            <AuthResultsBadge
              message={message}
              simpleLoginForward={getSimpleLoginForward(message) !== null}
            />
          </>
        ) : (
          <span className="truncate text-sm font-semibold">Unknown sender</span>
        )}
      </div>
      {address || date ? (
        <div className="flex min-w-0 items-center text-xs text-muted-foreground">
          {address ? <span className="truncate">{address}</span> : null}
          {date ? (
            <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">
              {address ? <span aria-hidden className="px-1">·</span> : null}
              {date}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
