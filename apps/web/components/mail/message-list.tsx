"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { useIsMobile } from "@workspace/ui/hooks";
import { cn } from "@workspace/ui/lib/utils";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "./mail-helpers";
import { SenderAvatar } from "./mail-avatar";
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

const ROW_HEIGHT_MOBILE = 60;
const ROW_HEIGHT_DESKTOP = 68;

function formatThreadSenders(messages: JmapEmailMessage[]): string {
  const uniqueSenders = Array.from(
    new Set(messages.map((message) => formatAddress(message.from))),
  );

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
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rowHeight = isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;

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

  const threadRows = useMemo(() => {
    const seenIds = new Set(messages.map((m) => m.id));
    const extras = relatedMessages.filter((m) => !seenIds.has(m.id));
    return buildMailConversations([...messages, ...extras]);
  }, [messages, relatedMessages]);

  const primaryIds = useMemo(
    () => new Set(messages.map((m) => m.id)),
    [messages],
  );

  const virtualizer = useVirtualizer({
    count: threadRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
    getItemKey: (index) => threadRows[index]?.id ?? String(index),
  });

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || !onLoadMore) return;
    onLoadMore();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const scheduleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || !onLoadMore) return;
    if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    loadMoreTimerRef.current = setTimeout(() => {
      loadMoreTimerRef.current = null;
      handleLoadMore();
    }, 150);
  }, [handleLoadMore, hasMore, isLoadingMore, onLoadMore]);

  const checkScrollForLoadMore = useCallback(() => {
    const element = scrollRef.current;
    if (!element || !hasMore || isLoadingMore || !onLoadMore) return;

    const remaining =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= rowHeight * 5) {
      scheduleLoadMore();
    }
  }, [rowHeight, hasMore, isLoadingMore, onLoadMore, scheduleLoadMore]);

  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualItemIndex = virtualItems[virtualItems.length - 1]?.index;

  useEffect(() => {
    if (lastVirtualItemIndex === undefined) return;
    if (lastVirtualItemIndex >= threadRows.length - 5) {
      scheduleLoadMore();
    }
  }, [lastVirtualItemIndex, threadRows.length, scheduleLoadMore]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener("scroll", checkScrollForLoadMore, {
      passive: true,
    });
    checkScrollForLoadMore();

    const resizeObserver = new ResizeObserver(() => {
      checkScrollForLoadMore();
    });
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", checkScrollForLoadMore);
      resizeObserver.disconnect();
      if (loadMoreTimerRef.current) {
        clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
    };
  }, [
    checkScrollForLoadMore,
    messages.length,
    threadRows.length,
    virtualizer,
  ]);

  useEffect(() => {
    if (!selectedMessageId) return;
    const index = threadRows.findIndex(
      (row) =>
        row.latestMessage.id === selectedMessageId ||
        row.messageIds.includes(selectedMessageId),
    );
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMessageId]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No messages</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-mail-list-scroll
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6 safe-area-inset-bottom"
    >
      {isBarVisible && (
        <div
          ref={barRef}
          className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-background/95 backdrop-blur-sm"
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
                className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                aria-label="Bulk actions"
              >
                <MoreHorizontal className="size-3.5" strokeWidth={2.25} />
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
                  <MailCheck className="size-3.5" strokeWidth={2.25} />
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
                  <MailOpen className="size-3.5" strokeWidth={2.25} />
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
                  <Trash2 className="size-3.5" strokeWidth={2.25} />
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
                      className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground"
                    >
                      <FolderInput className="size-3.5" strokeWidth={2.25} />
                      <span className="truncate">{mailbox.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const row = threadRows[virtualRow.index];
          if (!row) return null;
          const message = row.latestMessage;
            const isSelected = row.messageIds.includes(selectedMessageId ?? "");
            const selectedCount = row.messageIds.filter((id) =>
              selectedIds.has(id),
            ).length;
            const isChecked = selectedCount === row.messageIds.length;
            // Only count unread from primary mailbox messages (not sent/related extras)
            // so own sent replies don't inflate the unread counter.
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
                  <div
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${rowHeight}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(message.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(message.id);
                      }
                    }}
                    className={cn(
                      "group/row relative w-full text-left transition-colors cursor-pointer border-b border-border/40 [content-visibility:auto]",
                      isMobile ? "py-2 pl-3 pr-2.5" : "py-2 pl-[13px] pr-3",
                      "data-[state=open]:bg-muted/60",
                      isChecked
                        ? "bg-primary/5 dark:bg-primary/10"
                        : isSelected
                          ? "bg-muted/70 dark:bg-muted/50"
                          : "hover:bg-muted/40 dark:hover:bg-muted/50",
                    )}
                  >
                    {/* Left accent bar — always present to avoid layout shift */}
                    <span
                      className={cn(
                        "absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-colors",
                        isChecked
                          ? "bg-primary"
                          : isSelected
                            ? "bg-border"
                            : "bg-transparent",
                      )}
                    />

                    <div className={cn("flex items-start", isMobile ? "gap-2" : "gap-2.5")}>
                      {/* Avatar / checkbox toggle */}
                      <button
                        type="button"
                        className="relative shrink-0 cursor-pointer rounded-full group/avatar"
                        onClick={(e) => toggleSelect(e, row.messageIds)}
                        title="Select"
                        aria-label="Select message"
                      >
                        <SenderAvatar
                          email={message.from?.[0]?.email ?? ""}
                          name={message.from?.[0]?.name ?? undefined}
                        />
                        {/* Checkbox overlay — only visible on avatar hover or when checked */}
                        <span
                          className={cn(
                            "absolute inset-0 rounded-full flex items-center justify-center transition-opacity",
                            isChecked
                              ? "opacity-100 bg-background/85"
                              : "opacity-0 group-hover/avatar:opacity-100 bg-background/80",
                          )}
                        >
                          {selectedCount > 0 ? (
                            <CheckSquare
                              className="size-4 text-primary"
                              strokeWidth={2.25}
                            />
                          ) : (
                            <Square
                              className="size-4 text-muted-foreground/50"
                              strokeWidth={2.25}
                            />
                          )}
                        </span>
                      </button>

                      <div className="flex-1 min-w-0">
                        {/* Top row: sender + meta */}
                        <div
                          className={cn(
                            "mb-0.5 flex items-center justify-between gap-2",
                            isMobile ? "mb-0" : "",
                          )}
                        >
                          <span
                            className={cn(
                              "truncate",
                              isMobile ? "text-[12.5px]" : "text-[13px]",
                              isRead
                                ? "font-medium text-foreground/70 dark:text-foreground/85"
                                : "font-semibold text-foreground",
                            )}
                          >
                            {senderLabel}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Thread count or unread dot */}
                            {row.messages.length > 1 ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
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
                                <MessageSquare
                                  className="size-2.5"
                                  strokeWidth={2.25}
                                />
                                {unreadCount > 0 &&
                                unreadCount < row.messages.length
                                  ? `${unreadCount}/${row.messages.length}`
                                  : row.messages.length}
                              </span>
                            ) : (
                              !isRead && (
                                <span
                                  className="size-1.5 rounded-full bg-primary shrink-0"
                                  aria-label="Unread"
                                />
                              )
                            )}
                            {hasAttachments && (
                              <Paperclip
                                className="size-3 text-muted-foreground/60 shrink-0"
                                strokeWidth={2}
                                aria-label="Has attachments"
                              />
                            )}
                            <span className="text-[11px] text-muted-foreground/65 dark:text-muted-foreground/80 tabular-nums">
                              {formatMessageDate(
                                message.receivedAt,
                                timeFormat,
                                timezone,
                              )}
                            </span>
                            {/* Star — always slightly visible */}
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
                              className={cn(
                                "shrink-0 cursor-pointer transition-opacity",
                                isFlagged
                                  ? "opacity-100"
                                  : "opacity-20 group-hover/row:opacity-60 hover:!opacity-100",
                              )}
                              aria-label={isFlagged ? "Unstar" : "Star"}
                            >
                              <Star
                                className={cn(
                                  "size-3.5",
                                  isFlagged
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-muted-foreground",
                                )}
                                strokeWidth={2}
                              />
                            </span>
                          </div>
                        </div>

                        {/* Subject */}
                          <p
                            className={cn(
                              "truncate leading-snug",
                              isMobile ? "text-xs" : "text-[12.5px]",
                              isRead
                                ? "text-foreground/50 dark:text-foreground/60"
                                : "text-foreground/80 dark:text-foreground/90",
                          )}
                        >
                          {message.subject || "(No subject)"}
                        </p>
                      </div>
                    </div>
                  </div>
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

                  {onToggleFlagged && (
                    <ContextMenuItem
                      onClick={() => onToggleFlagged(message.id)}
                    >
                      <Star
                        className={isFlagged ? "fill-amber-400 text-amber-400" : ""}
                        strokeWidth={2}
                      />
                      {isFlagged ? "Remove star" : "Star"}
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
          })}
      </div>
      {hasMore && isLoadingMore && (
        <div className="flex items-center justify-center py-4">
          <AppLoadingState variant="inline" text="Loading more messages…" />
        </div>
      )}
    </div>
  );
}
