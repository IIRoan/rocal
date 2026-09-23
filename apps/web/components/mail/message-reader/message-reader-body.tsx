"use client";

import { useLayoutEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import {
  Image as ImageIcon,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  addTrustedSender,
} from "@/lib/mail/mail-display-settings";
import { EventReminderBanner } from "../event-reminder-banner";
import {
  EventReminderMessageBody,
  EventReminderMessageBodyLoading,
} from "../event-reminder-message-body";
import { fadeInMailReaderContent } from "../mail-app/mail-reader-transition";
import { MessageDecryptingSkeleton } from "../message-decrypting-loader";
import { HtmlEmailRenderer } from "./html-email-renderer";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";
import { PLAINTEXT_COLLAPSE_THRESHOLD } from "./constants";

export function MessageReaderBody({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    isDecrypting,
    isBodyLoading,
    isDark,
    displaySettings,
    allowExternalContent,
    setAllowExternalContent,
    externalContentSenderEmail,
    blockRemoteImages,
    blockTrackingPixels,
    dispatchMessageUi,
    dispatchChrome,
    showQuote,
    isBodyExpanded,
    isEventReminderEmail,
    linkedCalendarEvent,
    props,
  } = controller;
  const {
    displayHtml,
    displayText,
    renderAsHtml,
    cleanHtml,
    htmlHasQuote,
    hasRemoteContent,
    shouldReplaceBodyWithEventReminder,
    isReminderEventLoading,
    eventReminderView,
    plaintextBody,
    plaintextQuote,
  } = view;
  const showSkeleton = isDecrypting || isBodyLoading;
  const bodyRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const wasSkeletonRef = useRef(showSkeleton);

  // Skeleton and body share the same flex-1 box, so the swap is a fade in place with no layout shift.
  useLayoutEffect(() => {
    const wasSkeleton = wasSkeletonRef.current;
    wasSkeletonRef.current = showSkeleton;
    const body = bodyRef.current;
    if (!wasSkeleton || showSkeleton || !body) return;
    const fade = fadeInMailReaderContent(body, prefersReducedMotion);
    return () => fade?.cancel();
  }, [showSkeleton, prefersReducedMotion]);

  const standardBodyContent = showSkeleton ? (
    <MessageDecryptingSkeleton
      isDark={isDark}
      label={isDecrypting ? undefined : "Loading message"}
    />
  ) : shouldReplaceBodyWithEventReminder &&
  eventReminderView ? (
    <EventReminderMessageBody reminder={eventReminderView} isDark={isDark} />
  ) : isReminderEventLoading ? (
    <EventReminderMessageBodyLoading isDark={isDark} />
  ) : renderAsHtml ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-secondary)]">
      {blockRemoteImages &&
        displaySettings.externalContentPolicy !== "allow" &&
        hasRemoteContent && (
        <div className="shrink-0 border-b border-[var(--border-tertiary)] bg-[var(--bg-overlay-tertiary)] px-4 py-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Lock className="mt-0.5 size-3 shrink-0" strokeWidth={2.25} />
              <span>Remote images and other external content are blocked.</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {displaySettings.externalContentPolicy === "ask" && (
                <button
                  type="button"
                  onClick={() => setAllowExternalContent(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ImageIcon className="size-3.5" />
                  Load images
                </button>
              )}
              {externalContentSenderEmail && (
                <button
                  type="button"
                  onClick={() => {
                    addTrustedSender(externalContentSenderEmail);
                    setAllowExternalContent(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ShieldCheck className="size-3.5" />
                  Trust sender
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <HtmlEmailRenderer
        key={view.message.id}
        html={showQuote ? displayHtml! : cleanHtml}
        blockRemoteImages={blockRemoteImages}
        blockTrackingPixels={blockTrackingPixels}
        isDark={isDark}
      />
      {htmlHasQuote && (
        <div className="shrink-0 border-t border-[var(--border-tertiary)] px-4 py-2">
          <button
            type="button"
            onClick={() =>
              dispatchMessageUi({
                type: "patch",
                patch: { showQuote: !showQuote },
              })
            }
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1"
          >
            <span className="tracking-widest leading-none">···</span>
            {showQuote ? "Hide quoted text" : "Show quoted text"}
          </button>
        </div>
      )}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-secondary)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {displayText ? (
          <>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
              {(() => {
                const activeText = showQuote ? displayText : plaintextBody;
                if (
                  !isBodyExpanded &&
                  activeText.length > PLAINTEXT_COLLAPSE_THRESHOLD
                ) {
                  return (
                    activeText.slice(0, PLAINTEXT_COLLAPSE_THRESHOLD) + "…"
                  );
                }
                return activeText;
              })()}
            </div>
            {/* Show more/less for long bodies */}
            {(showQuote ? displayText : plaintextBody).length >
              PLAINTEXT_COLLAPSE_THRESHOLD && (
              <button
                type="button"
                onClick={() =>
                  dispatchChrome({ type: "toggle", field: "isBodyExpanded" })
                }
                className="mt-3 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
              >
                {isBodyExpanded
                  ? "Show less"
                  : `Show more (${Math.round((showQuote ? displayText : plaintextBody).length / 1000)}k chars)`}
              </button>
            )}
          </>
        ) : (
          <span className="text-sm italic text-[var(--text-disabled)]">No message body</span>
        )}
      </div>
      {/* Quoted chain toggle — pinned outside the scroll, same style as HTML version */}
      {plaintextQuote && (
        <div className="shrink-0 border-t border-[var(--border-tertiary)] px-4 py-2">
          <button
            type="button"
            onClick={() =>
              dispatchMessageUi({
                type: "patch",
                patch: { showQuote: !showQuote },
              })
            }
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1"
          >
            <span className="tracking-widest leading-none">···</span>
            {showQuote ? "Hide quoted text" : "Show quoted text"}
          </button>
        </div>
      )}
    </div>
  );

  const bodyContent =
    isEventReminderEmail && linkedCalendarEvent ? (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <EventReminderBanner
          eventId={linkedCalendarEvent.eventId}
          loading={linkedCalendarEvent.loading}
          error={linkedCalendarEvent.error}
          reminder={eventReminderView}
          className="mb-3 shrink-0"
        />
        <div className="flex min-h-0 flex-1 flex-col">{standardBodyContent}</div>
      </div>
    ) : (
      standardBodyContent
    );

  return (
    <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
      {bodyContent}
    </div>
  );
}
