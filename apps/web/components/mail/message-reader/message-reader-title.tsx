"use client";

import { Star } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  Typography,
  TypographySize,
  TypographyWeight,
} from "@workspace/ui/solace";
import { resolveLabelDisplayColor } from "@workspace/calendar-core";
import { MailSecurityBadge } from "./mail-security-badge";
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
  const { isMobile, isBusy, message, isFlagged, messageLabels, props } =
    controller;
  const {
    signatureVerificationState,
    decryptError,
    accountEncryptedAtRest,
    onToggleFlagged,
  } = props;
  const { messageState } = view;

  return (
    <div className="shrink-0 border-b border-[var(--border-tertiary)]">
      <div
        className={cn(
          "flex items-start justify-between gap-2",
          isMobile ? "px-3 py-2" : "min-h-14 px-4 py-[15px]",
        )}
      >
        <Typography
          size={isMobile ? TypographySize.SMALL : TypographySize.H3}
          weight={TypographyWeight.MEDIUM}
          wrap
        >
          {message.subject || "(No subject)"}
        </Typography>
        <div className="mt-0.5 flex shrink-0 items-center gap-1">
          {onToggleFlagged && (
            <button
              type="button"
              onClick={onToggleFlagged}
              disabled={isBusy}
              aria-label={isFlagged ? "Unstar" : "Star"}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded outline-none transition-colors hover:bg-[var(--bg-overlay-tertiary)] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40"
            >
              <Star
                className={cn(
                  "size-4 transition-colors",
                  isFlagged
                    ? "fill-amber-400 text-amber-400"
                    : "text-[var(--icon-disabled)] hover:text-amber-400",
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
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `${displayColor}22`,
                  color: displayColor,
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
    </div>
  );
}
