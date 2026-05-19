"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  Trash2,
  FolderInput,
  MailOpen,
  MailCheck,
  CheckSquare,
  Square,
  MoreHorizontal,
  Search,
  Star,
  Paperclip,
  MessageSquare,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { AppLoadingState } from "@workspace/ui/components/ui";
import { cn } from "@workspace/ui/lib/utils";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "./mail-helpers";
import { SenderAvatar } from "./mail-avatar";
import { filterMessages } from "@/lib/mail/message-filter";
import { buildMailConversations } from "@/lib/mail/conversation-thread";

const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);

interface MessageListProps {
  messages: JmapEmailMessage[];
  /** Cross-mailbox messages (sent, etc.) used to augment thread grouping */
  relatedMessages?: JmapEmailMessage[];
  selectedMessageId: string | null;
  onSelect: (id: string) => void;
  mailboxes?: JmapMailbox[];
  currentMailboxId?: string | null;
  onDelete?: (id: string) => void;
  onMove?: (id: string, targetMailboxId: string) => void;
  onMarkAsUnread?: (id: string) => void;
  onMarkAsRead?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkMove?: (ids: string[], targetMailboxId: string) => void;
  onBulkMarkAsUnread?: (ids: string[]) => void;
  onBulkMarkAsRead?: (ids: string[]) => void;
  onToggleFlagged?: (id: string) => void;
  labels?: LabelDef[];
  timeFormat?: "12h" | "24h";
  timezone?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

type MessageThreadRow = ReturnType<typeof buildMailConversations>[number];

function formatThreadSenders(messages: JmapEmailMessage[]): string {
  const uniqueSenders = messages
    .map((message) => formatAddress(message.from))
    .filter((sender, index, senders) => senders.indexOf(sender) === index);

  if (uniqueSenders.length <= 2) {
    return uniqueSenders.join(", ");
  }

  return `${uniqueSenders.slice(0, 2).join(", ")} +${uniqueSenders.length - 2}`;
}

export function MessageList({
  messages,
  relatedMessages = [],
  selectedMessageId,
  onSelect,
  mailboxes,
  currentMailboxId,
  onDelete,
  onMove,
  onMarkAsUnread,
  onMarkAsRead,
  onBulkDelete,
  onBulkMove,
  onBulkMarkAsUnread,
  onBulkMarkAsRead,
  onToggleFlagged,
  labels = [],
  timeFormat,
  timezone,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: MessageListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBarVisible, setIsBarVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const moveTargets = (mailboxes ?? []).filter(
    (m) =>
      m.id !== currentMailboxId &&
      !MOVE_EXCLUDED_ROLES.has(m.role?.toLowerCase() ?? ""),
  );

  const toggleSelect = (e: React.MouseEvent, ids: string[]) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    const allSelected = ids.every((id) => next.has(id));
    ids.forEach((id) => {
      if (allSelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
    });
    setSelectedIds(next);
    if (next.size > 0) {
      setIsBarVisible(true);
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkIds = Array.from(selectedIds);
  const hasBulkSelection = selectedIds.size > 0;

  useGSAP(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (hasBulkSelection) {
      gsap.fromTo(
        bar,
        { y: -6, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.22, ease: "power2.out" },
      );
    } else if (isBarVisible) {
      gsap.to(bar, {
        y: -6,
        opacity: 0,
        duration: 0.16,
        ease: "power2.in",
        onComplete: () => setIsBarVisible(false),
      });
    }
  }, [hasBulkSelection, isBarVisible]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container || !hasMore || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) onLoadMore();
      },
      { root: container, rootMargin: "100px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, isLoadingMore]);

  const visibleMessages = filterMessages(messages, searchQuery);
  const threadRows = useMemo(() => {
    // Merge primary messages with related cross-mailbox messages (e.g. Sent)
    // so thread grouping reflects the full conversation, not just the current mailbox.
    const seenIds = new Set(visibleMessages.map((m) => m.id));
    const extras = relatedMessages.filter((m) => !seenIds.has(m.id));
    return buildMailConversations([...visibleMessages, ...extras]);
  }, [visibleMessages, relatedMessages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No messages</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col h-full overflow-y-auto">
      <div className="sticky top-0 z-20 px-3 py-2 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 focus-within:bg-muted/80 transition-colors">
          <Search
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
            strokeWidth={2}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1 border-0 border-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:outline-none focus:ring-0 focus:border-none [&:focus-visible]:outline-none"
          />
        </div>
      </div>
      {isBarVisible && (
        <div
          ref={barRef}
          className="sticky top-[41px] z-10 flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-background/95 backdrop-blur-sm"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] font-medium text-foreground/60 bg-muted/60 hover:bg-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
            >
              {selectedIds.size} selected ×
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(messages.map((m) => m.id)))}
              className="text-[11px] font-medium text-foreground/60 bg-muted/60 hover:bg-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
            >
              Select all
            </button>
          </div>
          <Popover open={bulkActionsOpen} onOpenChange={setBulkActionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                aria-label="Bulk actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-52 p-0 overflow-hidden rounded-lg border border-border shadow-md"
            >
              <div className="flex border-b border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    onBulkMarkAsRead?.(bulkIds);
                    clearSelection();
                    setBulkActionsOpen(false);
                  }}
                  className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <MailCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Read
                </button>
                <div className="w-px self-stretch bg-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    onBulkMarkAsUnread?.(bulkIds);
                    clearSelection();
                    setBulkActionsOpen(false);
                  }}
                  className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <MailOpen className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Unread
                </button>
                <div className="w-px self-stretch bg-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    onBulkDelete?.(bulkIds);
                    clearSelection();
                    setBulkActionsOpen(false);
                  }}
                  className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-accent"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Delete
                </button>
              </div>
              {moveTargets.length > 0 && (
                <div className="p-1">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Move to
                  </div>
                  {moveTargets.map((mailbox) => (
                    <button
                      key={mailbox.id}
                      type="button"
                      onClick={() => {
                        onBulkMove?.(bulkIds, mailbox.id);
                        clearSelection();
                        setBulkActionsOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground"
                    >
                      <FolderInput className="h-3.5 w-3.5" strokeWidth={2.25} />
                      <span className="truncate">{mailbox.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border/40">
        {visibleMessages.length === 0 && searchQuery ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              No results for &quot;{searchQuery}&quot;
            </p>
          </div>
        ) : (
          threadRows.map((row) => {
            const message = row.latestMessage;
            const isSelected = row.messageIds.includes(selectedMessageId ?? "");
            const selectedCount = row.messageIds.filter((id) =>
              selectedIds.has(id),
            ).length;
            const isChecked = selectedCount === row.messageIds.length;
            // Only count unread from primary mailbox messages (not sent/related extras)
            // so own sent replies don't inflate the unread counter.
            const primaryIds = new Set(messages.map((m) => m.id));
            const primaryMessages = row.messages.filter((entry) =>
              primaryIds.has(entry.id),
            );
            const unreadCount = primaryMessages.filter(
              (entry) => !entry.keywords?.["$seen"],
            ).length;
            const isRead = unreadCount === 0;
            const isFlagged = row.messages.some(
              (entry) => entry.keywords?.["$flagged"] === true,
            );
            const messageLabels = labels.filter(
              (l) => message.keywords?.[`label:${l.id}`] === true,
            );
            const hasAttachments = row.messages.some(
              (entry) => (entry.attachments?.length ?? 0) > 0,
            );
            const senderLabel =
              row.messages.length > 1
                ? formatThreadSenders(row.messages)
                : formatAddress(message.from);
            return (
              <ContextMenu key={row.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelect(message.id)}
                    className={`group/row w-full px-3 py-2.5 text-left transition-colors data-[state=open]:bg-muted/60 data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-border/60 ${isChecked ? "bg-primary/5 dark:bg-primary/10" : isSelected ? "bg-muted/80 dark:bg-muted" : "hover:bg-muted/40 dark:hover:bg-muted/60"}`}
                  >
                    <div className="flex items-start gap-2.5">
                        <div
                          className="relative shrink-0 cursor-pointer p-2 -m-2 rounded-full"
                          onClick={(e) => toggleSelect(e, row.messageIds)}
                        >
                          <SenderAvatar
                            email={message.from?.[0]?.email ?? ""}
                          name={message.from?.[0]?.name ?? undefined}
                        />
                          <span
                            className={`absolute inset-0 rounded-full flex items-center justify-center bg-background/80 transition-opacity ${isChecked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`}
                          >
                            {selectedCount > 0 ? (
                              <CheckSquare
                                className="h-4 w-4 text-primary"
                                strokeWidth={2.25}
                            />
                          ) : (
                            <Square
                              className="h-4 w-4 text-muted-foreground/60"
                              strokeWidth={2.25}
                            />
                          )}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span
                            className={`text-[13px] truncate ${isRead ? "font-medium text-foreground/70 dark:text-foreground/85" : "font-semibold text-foreground"}`}
                          >
                            {senderLabel}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {row.messages.length > 1 ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  unreadCount > 0
                                    ? "bg-primary/15 text-primary dark:bg-primary/20"
                                    : "bg-muted text-muted-foreground",
                                )}
                                aria-label={
                                  unreadCount > 0
                                    ? `${unreadCount} unread of ${row.messages.length}`
                                    : `${row.messages.length} messages in thread`
                                }
                              >
                                <MessageSquare className="h-2.5 w-2.5" strokeWidth={2.25} />
                                {unreadCount > 0 &&
                                unreadCount < row.messages.length
                                  ? `${unreadCount}/${row.messages.length}`
                                  : row.messages.length}
                              </span>
                            ) : (
                              !isRead && (
                                <span
                                  className="h-1.5 w-1.5 rounded-full bg-primary"
                                  aria-label="Unread"
                                />
                              )
                            )}
                            {hasAttachments && (
                              <Paperclip
                                className="h-3 w-3 text-muted-foreground/70"
                                strokeWidth={2}
                                aria-label="Has attachments"
                              />
                            )}
                            <span className="text-[11px] text-muted-foreground/70 dark:text-muted-foreground/90">
                              {formatMessageDate(
                                message.receivedAt,
                                timeFormat,
                                timezone,
                              )}
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFlagged?.(message.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onToggleFlagged?.(message.id);
                                }
                              }}
                              className={`transition-opacity cursor-pointer ${isFlagged ? "opacity-100" : "opacity-0 group-hover/row:opacity-60 hover:!opacity-100"}`}
                              aria-label={isFlagged ? "Unstar" : "Star"}
                            >
                              <Star
                                className={`h-3 w-3 ${isFlagged ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                                strokeWidth={2}
                              />
                            </span>
                          </div>
                        </div>
                        <p
                          className={`text-[13px] truncate ${isRead ? "text-foreground/50 dark:text-foreground/65" : "text-foreground/80 dark:text-foreground/90"}`}
                        >
                          {message.subject || "(No subject)"}
                        </p>
                        {messageLabels.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {messageLabels.map((label) => (
                              <span
                                key={label.id}
                                className="inline-flex items-center rounded-sm px-1 text-[9px] font-semibold leading-[14px] tracking-wide uppercase"
                                style={{
                                  backgroundColor: `${label.color}20`,
                                  color: label.color,
                                }}
                              >
                                {label.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                </ContextMenuTrigger>

                <ContextMenuContent className="w-52">
                  {isRead ? (
                    <ContextMenuItem
                      onClick={() =>
                        row.messageIds.length > 1
                          ? onBulkMarkAsUnread?.(row.messageIds)
                          : onMarkAsUnread?.(message.id)
                      }
                    >
                      <MailOpen />
                      Mark as unread
                    </ContextMenuItem>
                  ) : (
                    <ContextMenuItem
                      onClick={() =>
                        row.messageIds.length > 1
                          ? onBulkMarkAsRead?.(row.messageIds)
                          : onMarkAsRead?.(message.id)
                      }
                    >
                      <MailCheck />
                      Mark as read
                    </ContextMenuItem>
                  )}

                  {moveTargets.length > 0 && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="gap-2">
                        <FolderInput />
                        Move to
                      </ContextMenuSubTrigger>
                      <ContextMenuPortal>
                        <ContextMenuSubContent className="w-44">
                          {moveTargets.map((mailbox) => (
                            <ContextMenuItem
                              key={mailbox.id}
                              onClick={() =>
                                row.messageIds.length > 1
                                  ? onBulkMove?.(row.messageIds, mailbox.id)
                                  : onMove?.(message.id, mailbox.id)
                              }
                            >
                              {mailbox.name}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuPortal>
                    </ContextMenuSub>
                  )}

                  <ContextMenuSeparator />

                  <ContextMenuItem
                    variant="destructive"
                    onClick={() =>
                      row.messageIds.length > 1
                        ? onBulkDelete?.(row.messageIds)
                        : onDelete?.(message.id)
                    }
                  >
                    <Trash2 />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })
        )}
      </div>
      {hasMore && !searchQuery && (
        <div
          ref={sentinelRef}
          className="flex items-center justify-center py-4"
        >
          {isLoadingMore && (
            <AppLoadingState
              variant="inline"
              text="Loading your workspace..."
            />
          )}
        </div>
      )}
    </div>
  );
}
