"use client";

import { formatDateTimeLabel, resolveTimezone } from "@workspace/calendar-core";
import { cn } from "@workspace/ui/lib/utils";
import { SenderAvatar } from "../mail-avatar";
import {
  RecipientPopover,
  RecipientPopoverList,
} from "../recipient-popover";
import { MailIdentityBadge } from "../mail-identity-badge";
import { AuthResultsBadge } from "../auth-results-badge";
import { MessageReaderHeaderAttachments } from "./message-reader-header-attachments";
import { MessageReaderMobileActionsDrawer } from "./message-reader-mobile-actions-drawer";
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

  return (
    <div className={cn("flex shrink-0 flex-col", isMobile ? "gap-1.5" : "gap-3")}>
      <div className={cn("flex items-start", isMobile ? "gap-2" : "gap-3")}>
        <SenderAvatar
          email={senderEmail}
          name={enrichedSender.name ?? undefined}
          className={isMobile ? "size-7 text-[10px]" : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {senderEmail ? (
                <>
                  <RecipientPopover
                    name={enrichedSender.name}
                    email={enrichedSender.email}
                    showInlineAddress={Boolean(enrichedSender.name?.trim())}
                    className={cn(
                      "truncate font-medium",
                      isMobile ? "text-xs" : "text-[13px]",
                    )}
                  />
                  <MailIdentityBadge
                    message={message}
                    identities={identities}
                  />
                  <AuthResultsBadge
                    authResultsHeaders={message["header:Authentication-Results"]}
                  />
                </>
              ) : (
                <span
                  className={cn(
                    "truncate font-medium",
                    isMobile ? "text-xs" : "text-[13px]",
                  )}
                >
                  Unknown sender
                </span>
              )}
            </div>
            {message.receivedAt && (
              <span
                className={cn(
                  "shrink-0 text-muted-foreground",
                  isMobile ? "text-[10px]" : "text-[11px]",
                )}
              >
                {formatDateTimeLabel(
                  new Date(message.receivedAt),
                  resolveTimezone(timezone),
                  timeFormat,
                )}
              </span>
            )}
          </div>
          {(message.to?.length ?? 0) > 0 && (
            <div
              className={cn(
                "min-w-0 text-muted-foreground",
                isMobile
                  ? "flex items-center gap-1 text-[11px]"
                  : "flex items-center gap-1 text-xs",
              )}
            >
              <span>To:</span>
              <RecipientPopoverList
                recipients={message.to!}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                className="min-w-0 text-foreground/80"
              />
            </div>
          )}
          {(message.cc?.length ?? 0) > 0 && (
            <div
              className={cn(
                "min-w-0 text-muted-foreground",
                isMobile
                  ? "flex items-center gap-1 text-[11px]"
                  : "flex items-center gap-1 text-xs",
              )}
            >
              <span>CC:</span>
              <RecipientPopoverList
                recipients={message.cc!}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                className="min-w-0 text-foreground/80"
              />
            </div>
          )}
        </div>
      </div>

      <MessageReaderHeaderAttachments controller={controller} view={view} />

      {isMobile && (
        <MessageReaderMobileActionsDrawer controller={controller} view={view} />
      )}

      {decryptError && (
        <div className="rounded-md border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 mt-3">
          {decryptError}
        </div>
      )}
    </div>
  );
}
