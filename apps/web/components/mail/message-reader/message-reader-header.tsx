"use client";

import { Star } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { cn } from "@workspace/ui/lib/utils";
import { SenderAvatar } from "../mail-avatar";
import { LabelPickerPanel } from "../label-picker-panel";
import { resolveLabelDisplayColor } from "@/lib/mail/mail-label-colors";
import {
  RecipientPopover,
  RecipientPopoverList,
} from "../recipient-popover";
import { MailIdentityBadge } from "../mail-identity-badge";
import { AuthResultsBadge } from "../auth-results-badge";
import { MailSecurityBadge } from "./mail-security-badge";
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
  const {
    isMobile,
    labelPopoverOpen,
    dispatchChrome,
    isBusy,
    message,
    isFlagged,
    messageLabels,
    props,
  } = controller;
  const {
    signatureVerificationState,
    decryptError,
    accountEncryptedAtRest,
    onToggleFlagged,
    onSetLabel,
    onCreateLabel,
    onUpdateLabel,
    onDeleteLabel,
    timeFormat,
    timezone,
    accountEmail,
    accountName,
    identities,
    labels,
  } = props;
  const {
    messageState,
    senderEmail,
    enrichedSender,
  } = view;

  const labelPopoverContent = (
    <PopoverContent
      side={isMobile ? "top" : "bottom"}
      align={isMobile ? "start" : "end"}
      sideOffset={6}
      className="w-56 p-0 overflow-hidden"
    >
      <LabelPickerPanel
        labels={labels}
        messageKeywords={message?.keywords}
        onToggleLabel={
          onSetLabel
            ? (labelId, assigned) => onSetLabel(labelId, assigned)
            : undefined
        }
        onCreateLabel={onCreateLabel}
        onUpdateLabel={onUpdateLabel}
        onDeleteLabel={onDeleteLabel}
      />
    </PopoverContent>
  );

  const labelPopoverTrigger = ((onSetLabel && labels.length > 0) ||
    onCreateLabel) && (
    <Popover
      open={labelPopoverOpen}
      onOpenChange={(open) =>
        dispatchChrome({ type: "patch", patch: { labelPopoverOpen: open } })
      }
    >
      <PopoverTrigger asChild>
        <span
          aria-hidden
          className="absolute opacity-0 pointer-events-none"
          style={{ top: 0, right: 0 }}
        />
      </PopoverTrigger>
      {labelPopoverContent}
    </Popover>
  );

  return (
    <div
      className={cn(
        "relative shrink-0 flex flex-col",
        isMobile ? "gap-1.5 px-3 py-2" : "gap-2.5 px-4 py-3",
      )}
    >
      {labelPopoverTrigger}

      {/* Subject + action buttons */}
      <div
        className={cn(
          "flex items-start justify-between",
          isMobile ? "gap-1.5" : "gap-2",
        )}
      >
        <div
          className={cn(
            "font-medium leading-snug",
            isMobile ? "pr-1 text-[13px]" : "",
          )}
        >
          {message.subject || "(No subject)"}
        </div>
        <div
          className={cn(
            "mt-0.5 flex shrink-0 items-center gap-1",
            isMobile ? "mt-0" : "",
          )}
        >
          {onToggleFlagged && (
            <button
              type="button"
              onClick={onToggleFlagged}
              disabled={isBusy}
              aria-label={isFlagged ? "Unstar" : "Star"}
              className="inline-flex items-center justify-center size-7 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <Star
                className={cn(
                  "size-4 transition-colors",
                  isFlagged
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40 hover:text-amber-400",
                )}
                strokeWidth={2}
              />
            </button>
          )}
          <MailSecurityBadge
            messageState={messageState}
            accountEncryptedAtRest={accountEncryptedAtRest}
            signatureVerificationState={signatureVerificationState}
            decryptionFailed={Boolean(decryptError)}
          />
        </div>
      </div>

      {/* Sender row: avatar + name/email/to + date */}
      <div className={cn("flex items-start", isMobile ? "gap-2" : "gap-2.5")}>
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
                {new Date(message.receivedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  hour12:
                    timeFormat === "12h"
                      ? true
                      : timeFormat === "24h"
                        ? false
                        : undefined,
                  timeZone: timezone ?? undefined,
                } as Intl.DateTimeFormatOptions)}
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

{/* Labels */}
      {messageLabels.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap items-center",
            isMobile ? "gap-1" : "gap-1.5",
          )}
        >
          {messageLabels.map((label) => {
            const displayColor = resolveLabelDisplayColor(label.color);
            return (
            <span
              key={label.id}
              title={label.name}
              className={cn(
                "inline-flex items-center gap-1 rounded-full font-medium",
                isMobile
                  ? "px-1.5 py-0.5 text-[10px]"
                  : "px-2 py-0.5 text-[11px]",
              )}
              style={{
                backgroundColor: `${displayColor}22`,
                color: displayColor,
              }}
            >
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ backgroundColor: displayColor }}
              />
              {label.name}
            </span>
            );
          })}
        </div>
      )}

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
