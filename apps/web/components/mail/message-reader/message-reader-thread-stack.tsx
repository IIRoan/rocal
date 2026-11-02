"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { planMailThreadStack, type TimeFormat } from "@workspace/calendar-core";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { cn } from "@workspace/ui/lib/utils";
import { buildMailPreviewSnippet } from "@/lib/mail/mail-preview";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { SenderAvatar } from "../mail-avatar";
import { fadeInMailReaderContent } from "../mail-app/mail-reader-transition";
import { formatMessageDate } from "../mail-helpers";
import { ConversationMessageMenu } from "./conversation-message-menu";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

const ROW_FOCUS_CLASS =
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60";

/** The thread as one scroll: the open message in place, the others as rows that open it. */
export function MessageReaderThreadStack({
  controller,
  view,
  children,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
  children: ReactNode;
}) {
  const { isMobile, props } = controller;
  const {
    onSelectConversationMessage,
    accountEmail,
    timeFormat,
    timezone,
    onConversationMessageDelete,
    onConversationMessageMarkUnread,
    onConversationMessageMove,
    conversationPreviews,
  } = props;
  const { orderedConversationMessages, message } = view;
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const shownMessageIdRef = useRef(message.id);
  const prefersReducedMotion = usePrefersReducedMotion();
  const entries = planMailThreadStack(
    orderedConversationMessages,
    message.id,
    showAll,
  );
  const isThread = entries.length > 1;
  const showActions = Boolean(
    onConversationMessageDelete ||
      onConversationMessageMarkUnread ||
      onConversationMessageMove,
  );

  // Opening another message of this thread keeps the stack still: only that message fades in, scrolled into view.
  useLayoutEffect(() => {
    if (shownMessageIdRef.current === message.id) return;
    shownMessageIdRef.current = message.id;
    const scroller = scrollRef.current;
    const expanded = expandedRef.current;
    if (!scroller || !expanded) return;
    const top = expanded.offsetTop;
    if (
      top < scroller.scrollTop ||
      top > scroller.scrollTop + scroller.clientHeight / 2
    ) {
      scroller.scrollTop = top;
    }
    const fade = fadeInMailReaderContent(expanded, prefersReducedMotion);
    return () => fade?.cancel();
  }, [message.id, prefersReducedMotion]);

  return (
    <div
      ref={scrollRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {entries.map((entry) => {
        if (entry.kind === "folded") {
          return (
            <button
              key={`folded:${entry.firstHiddenId}`}
              type="button"
              onClick={() => setShowAll(true)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-3 border-b border-[var(--border-tertiary)] py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--bg-cell-hover)] hover:text-foreground",
                isMobile ? "px-3" : "px-4",
                ROW_FOCUS_CLASS,
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-secondary)] text-[11px] tabular-nums">
                {entry.count}
              </span>
              {entry.count} more messages
            </button>
          );
        }
        if (entry.expanded) {
          return (
            <div
              key={entry.message.id}
              ref={expandedRef}
              className={cn(
                "flex flex-1 flex-col",
                isThread &&
                  "min-h-[min(36rem,80dvh)] border-b border-[var(--border-tertiary)] last:border-b-0",
              )}
            >
              {children}
            </div>
          );
        }
        return (
          <CollapsedThreadMessage
            key={entry.message.id}
            threadMessage={entry.message}
            isMobile={isMobile}
            accountEmail={accountEmail}
            preview={
              conversationPreviews?.[entry.message.id] ??
              buildMailPreviewSnippet(entry.message)
            }
            timeFormat={timeFormat}
            timezone={timezone}
            onSelect={onSelectConversationMessage}
            onDelete={onConversationMessageDelete}
            onMarkUnread={onConversationMessageMarkUnread}
            showActions={showActions}
          />
        );
      })}
    </div>
  );
}

function CollapsedThreadMessage({
  threadMessage,
  isMobile,
  accountEmail,
  preview,
  timeFormat,
  timezone,
  onSelect,
  onDelete,
  onMarkUnread,
  showActions,
}: {
  threadMessage: JmapEmailMessage;
  isMobile: boolean;
  accountEmail?: string | null;
  preview: string;
  timeFormat: TimeFormat;
  timezone?: string | null;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  showActions: boolean;
}) {
  const senderEmail = threadMessage.from?.[0]?.email ?? "";
  const senderName = threadMessage.from?.[0]?.name ?? undefined;
  const isOwn = Boolean(
    accountEmail && senderEmail.toLowerCase() === accountEmail.toLowerCase(),
  );
  const isRead = threadMessage.keywords?.["$seen"] === true || isOwn;
  const label = senderName || senderEmail || "Unknown";

  return (
    <div className="flex shrink-0 items-stretch border-b border-[var(--border-tertiary)] last:border-b-0 hover:bg-[var(--bg-cell-hover)]">
      <button
        type="button"
        onClick={() => onSelect?.(threadMessage.id)}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 text-left",
          isMobile ? "pl-3" : "pl-4",
          showActions ? "pr-1" : isMobile ? "pr-3" : "pr-4",
          ROW_FOCUS_CLASS,
        )}
      >
        <SenderAvatar
          email={senderEmail}
          name={senderName}
          className="size-7 shrink-0 text-[11px]"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[13px]",
                isRead
                  ? "font-medium text-foreground/80"
                  : "font-semibold text-foreground",
              )}
            >
              {label}
            </span>
            {isRead ? null : (
              <span className="size-1.5 shrink-0 rounded-full bg-primary">
                <span className="sr-only">Unread</span>
              </span>
            )}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {preview || "(No body)"}
          </span>
        </span>
        <span className="shrink-0 self-start pt-0.5 text-[11px] tabular-nums text-muted-foreground">
          {formatMessageDate(threadMessage.receivedAt, timeFormat, timezone)}
        </span>
      </button>
      {showActions ? (
        <div className="flex shrink-0 items-center pr-2">
          <ConversationMessageMenu
            messageId={threadMessage.id}
            isRead={isRead}
            onDelete={onDelete}
            onMarkUnread={onMarkUnread}
          />
        </div>
      ) : null}
    </div>
  );
}
