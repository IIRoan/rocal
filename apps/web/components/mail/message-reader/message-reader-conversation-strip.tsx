"use client";

import {
  ChevronDown,
  Eye,
  EyeOff,
  MessageSquare,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { SenderAvatar } from "../mail-avatar";
import { extractMessageBodies } from "@/lib/mail/message-security";
import { splitPlaintextQuote, splitHtmlQuote } from "@/lib/mail/quoted-text";
import { formatMessageDate } from "../mail-helpers";
import { ConversationMessageMenu } from "./conversation-message-menu";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

export function MessageReaderConversationStrip({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    dispatchMessageUi,
    dispatchChrome,
    conversationListRef,
    isConversationCollapsed,
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
  } = props;
  const {
    showConversation,
    orderedConversationMessages,
    ownMessageCount,
    visibleConversationMessages,
    message,
  } = view;

  if (!showConversation) return null;

  return (
    <div className="shrink-0 mx-4 mb-2 rounded-lg border border-border/50 overflow-hidden">
      {/* Strip header */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/40 transition-colors cursor-pointer",
          !isConversationCollapsed && "border-b border-border/40",
        )}
      >
        <button
          type="button"
          onClick={() =>
            dispatchMessageUi({
              type: "patch",
              patch: { isConversationCollapsed: !isConversationCollapsed },
            })
          }
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer rounded hover:bg-accent/60 -mx-1 px-1 py-0.5 transition-colors group/thread-header"
        >
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground transition-transform shrink-0 group-hover/thread-header:text-foreground",
              isConversationCollapsed && "-rotate-90",
            )}
          />
          <MessageSquare
            className="size-3 text-muted-foreground shrink-0 group-hover/thread-header:text-foreground"
            strokeWidth={2}
          />
          <span className="text-[11px] font-medium text-foreground/70 group-hover/thread-header:text-foreground">
            {`${orderedConversationMessages.length} messages in thread`}
          </span>
        </button>
        {ownMessageCount > 0 && !isConversationCollapsed && (
          <button
            type="button"
            onClick={() =>
              dispatchChrome({ type: "toggle", field: "showOwnMessages" })
            }
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 cursor-pointer"
          >
            {showOwnMessages ? (
              <EyeOff className="size-3" />
            ) : (
              <Eye className="size-3" />
            )}
            {showOwnMessages ? "Hide your replies" : `+${ownMessageCount} sent`}
          </button>
        )}
      </div>

      {/* Message rows — collapsible */}
      {!isConversationCollapsed && (
        <div
          ref={conversationListRef}
          className="max-h-36 overflow-y-auto divide-y divide-border/30"
        >
          {visibleConversationMessages.map((threadMessage) => {
            const threadSenderEmail = threadMessage.from?.[0]?.email ?? "";
            const threadSenderName = threadMessage.from?.[0]?.name ?? undefined;
            const threadBodies = extractMessageBodies(threadMessage);
            let rawPreview: string;
            if (threadBodies.html && !threadBodies.text) {
              const { html: cleanedHtml } = splitHtmlQuote(threadBodies.html);
              rawPreview = cleanedHtml.replace(/<[^>]+>/g, " ");
            } else {
              rawPreview =
                threadBodies.text ?? threadMessage.preview ?? "";
            }
            const { body: previewBody } = splitPlaintextQuote(rawPreview);
            const threadPreviewText = previewBody.replace(/\s+/g, " ").trim();
            const isActive =
              threadMessage.id === (selectedMessageId ?? message.id);
            const threadIsRead =
              threadMessage.keywords?.["$seen"] === true ||
              (accountEmail
                ? threadMessage.from?.[0]?.email?.toLowerCase() ===
                  accountEmail.toLowerCase()
                : false);
            const hasThreadActions =
              onConversationMessageDelete ||
              onConversationMessageMarkUnread ||
              onConversationMessageMove;

            return (
              <div
                key={threadMessage.id}
                className={cn(
                  "group/thread-item relative flex w-full items-center gap-2 px-3 py-1.5 transition-colors",
                  isActive ? "bg-primary/5" : "hover:bg-accent/40",
                )}
              >
                {/* Active left-border accent */}
                {isActive && (
                  <div className="absolute left-0 inset-y-0 w-0.5 bg-primary rounded-r" />
                )}

                {/* Unread dot */}
                {!threadIsRead ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                ) : (
                  <span className="size-1.5 shrink-0" />
                )}

                {/* Clickable row */}
                <button
                  type="button"
                  onClick={() =>
                    onSelectConversationMessage?.(threadMessage.id)
                  }
                  className="flex flex-1 min-w-0 cursor-pointer items-center gap-2 text-left"
                >
                  <SenderAvatar
                    email={threadSenderEmail}
                    name={threadSenderName}
                    className="size-5 shrink-0 text-[9px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          threadIsRead
                            ? "font-medium text-foreground/70"
                            : "font-semibold text-foreground",
                        )}
                      >
                        {threadSenderName || threadSenderEmail || "Unknown"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {threadPreviewText || "(No body)"}
                      </span>
                    </div>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[10px]">
                    {formatMessageDate(
                      threadMessage.receivedAt,
                      timeFormat,
                      timezone,
                    )}
                  </span>
                </button>

                {/* Per-message actions */}
                {hasThreadActions && (
                  <ConversationMessageMenu
                    messageId={threadMessage.id}
                    isRead={threadIsRead}
                    onDelete={onConversationMessageDelete}
                    onMarkUnread={onConversationMessageMarkUnread}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
