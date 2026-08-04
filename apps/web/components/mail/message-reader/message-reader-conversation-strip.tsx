"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, Eye, EyeOff, MessageSquare } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { SenderAvatar } from "../mail-avatar";
import { buildMailPreviewSnippet } from "@/lib/mail/mail-preview";
import { formatMessageDate } from "../mail-helpers";
import { ConversationMessageMenu } from "./conversation-message-menu";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";
import type { JmapEmailMessage } from "@/lib/mail/types";

export function MessageReaderConversationStrip({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    dispatchChrome,
    conversationListRef,
    showOwnMessages,
    selectedMessageId,
    props,
  } = controller;
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
  const {
    showConversation,
    orderedConversationMessages,
    ownMessageCount,
    visibleConversationMessages,
    message,
  } = view;

  const [expanded, setExpanded] = useState(false);

  if (!showConversation) return null;

  const messageCount = orderedConversationMessages.length;

  function toggleExpandedFromPointer(event: PointerEvent<HTMLButtonElement>) {
    // Primary button only. preventDefault stops text/image drag so the
    // press can't turn into a scroll/selection gesture on the reader pane.
    if (event.button !== 0) return;
    event.preventDefault();
    setExpanded((open) => !open);
  }

  function toggleExpandedFromKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setExpanded((open) => !open);
  }

  return (
    <div className="mx-4 mb-2 shrink-0 rounded-lg border border-border/50">
      <div
        className={cn(
          "flex items-stretch bg-muted/40",
          expanded && "border-b border-border/40",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="mail-conversation-thread-list"
          onPointerDown={toggleExpandedFromPointer}
          onKeyDown={toggleExpandedFromKeyboard}
          className={cn(
            "flex min-h-9 min-w-0 flex-1 items-center gap-1.5 px-3 py-1.5 text-left",
            "cursor-pointer select-none touch-manipulation",
            "hover:bg-accent/60",
          )}
        >
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              !expanded && "-rotate-90",
            )}
            aria-hidden
          />
          <MessageSquare
            className="size-3 shrink-0 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium tabular-nums text-foreground/70">
            {messageCount} messages in thread
          </span>
        </button>

        {expanded && ownMessageCount > 0 ? (
          <button
            type="button"
            onClick={() =>
              dispatchChrome({ type: "toggle", field: "showOwnMessages" })
            }
            className="mr-2 flex shrink-0 cursor-pointer items-center gap-1 self-center rounded px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {showOwnMessages ? (
              <EyeOff className="size-3" aria-hidden />
            ) : (
              <Eye className="size-3" aria-hidden />
            )}
            {showOwnMessages ? "Hide your replies" : `+${ownMessageCount} sent`}
          </button>
        ) : null}
      </div>

      {expanded ? (
        <ul
          id="mail-conversation-thread-list"
          ref={(node) => {
            conversationListRef.current = node;
            if (node) node.scrollTop = node.scrollHeight;
          }}
          className="m-0 max-h-36 list-none divide-y divide-border/30 overflow-y-auto p-0"
        >
          {visibleConversationMessages.map((threadMessage) => (
            <ThreadMessageRow
              key={threadMessage.id}
              threadMessage={threadMessage}
              isActive={
                threadMessage.id === (selectedMessageId ?? message.id)
              }
              accountEmail={accountEmail}
              preview={
                conversationPreviews?.[threadMessage.id] ??
                buildMailPreviewSnippet(threadMessage)
              }
              timeFormat={timeFormat}
              timezone={timezone}
              onSelect={onSelectConversationMessage}
              onDelete={onConversationMessageDelete}
              onMarkUnread={onConversationMessageMarkUnread}
              showActions={Boolean(
                onConversationMessageDelete ||
                  onConversationMessageMarkUnread ||
                  onConversationMessageMove,
              )}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ThreadMessageRow({
  threadMessage,
  isActive,
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
  isActive: boolean;
  accountEmail?: string | null;
  preview: string;
  timeFormat?: "12h" | "24h";
  timezone?: string | null;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  showActions: boolean;
}) {
  const senderEmail = threadMessage.from?.[0]?.email ?? "";
  const senderName = threadMessage.from?.[0]?.name ?? undefined;
  const isRead =
    threadMessage.keywords?.["$seen"] === true ||
    (accountEmail
      ? senderEmail.toLowerCase() === accountEmail.toLowerCase()
      : false);
  const label = senderName || senderEmail || "Unknown";

  function selectFromPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    onSelect?.(threadMessage.id);
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect?.(threadMessage.id);
  }

  return (
    <li
      className={cn(
        "relative flex items-stretch",
        isActive ? "bg-primary/5" : "hover:bg-accent/40",
      )}
    >
      {isActive ? (
        <div className="absolute inset-y-0 left-0 w-0.5 rounded-r bg-primary" />
      ) : null}

      <button
        type="button"
        onPointerDown={selectFromPointer}
        onKeyDown={selectFromKeyboard}
        aria-current={isActive ? "true" : undefined}
        aria-label={`Open message from ${label}`}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left",
          "cursor-pointer select-none touch-manipulation",
        )}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            isRead ? "bg-transparent" : "bg-primary",
          )}
        />
        <SenderAvatar
          email={senderEmail}
          name={senderName}
          className="size-5 shrink-0 text-[9px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span
              className={cn(
                "shrink-0 text-xs",
                isRead
                  ? "font-medium text-foreground/70"
                  : "font-semibold text-foreground",
              )}
            >
              {label}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {preview || "(No body)"}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
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
    </li>
  );
}
