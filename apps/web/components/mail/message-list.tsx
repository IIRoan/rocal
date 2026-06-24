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
  ShieldAlert,
  Tag,
  Inbox,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import { useIsMobile } from "@workspace/ui/hooks";
import { cn } from "@workspace/ui/lib/utils";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "./mail-helpers";
import { SenderAvatar } from "./mail-avatar";
import { buildMailConversations } from "@/lib/mail/conversation-thread";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import { resolveLabelDisplayColor } from "@/lib/mail/mail-label-colors";
import {
  findJunkMailbox,
  isJunkMailboxRole,
  isTrashMailboxRole,
} from "@/lib/mail/mail-mailbox-roles";

const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);
const EMPTY_RELATED_MESSAGES: JmapEmailMessage[] = [];
const EMPTY_LABELS: LabelDef[] = [];

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
  onReportSpam?: (id: string) => void;
  onNotSpam?: (id: string) => void;
  onBulkReportSpam?: (ids: string[]) => void;
  onSetLabel?: (messageId: string, labelId: string, assigned: boolean) => void;
  labels?: LabelDef[];
  timeFormat?: "12h" | "24h";
  timezone?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  density?: "compact" | "comfortable";
  showLabelChips?: boolean;
  threadExpandEnabled?: boolean;
  onExpandThread?: (threadId: string) => Promise<JmapEmailMessage[]> | void;
}

const ROW_HEIGHT_MOBILE = 60;
const ROW_HEIGHT_DESKTOP = 68;
const ROW_HEIGHT_DESKTOP_COMFORTABLE = 84;
const ROW_HEIGHT_MOBILE_COMFORTABLE = 76;
const ROW_HEIGHT_WITH_LABELS = 80;
const ROW_HEIGHT_WITH_LABELS_COMFORTABLE = 96;
const SCROLL_LOAD_THRESHOLD = 62;

function getRowHeight(
  message: JmapEmailMessage,
  labels: LabelDef[],
  isMobile: boolean,
  density: "compact" | "comfortable" = "compact",
  showLabelChips: boolean = true,
): number {
  const hasLabels = showLabelChips && getAllMessageLabels(message, labels).length > 0;
  if (density === "comfortable") {
    if (hasLabels) return ROW_HEIGHT_WITH_LABELS_COMFORTABLE;
    return isMobile ? ROW_HEIGHT_MOBILE_COMFORTABLE : ROW_HEIGHT_DESKTOP_COMFORTABLE;
  }
  if (hasLabels) return ROW_HEIGHT_WITH_LABELS;
  return isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
}

function MessageLabelChips({
  messageLabels,
  max = 2,
}: {
  messageLabels: LabelDef[];
  max?: number;
}) {
  if (messageLabels.length === 0) return null;
  const visible = messageLabels.slice(0, max);
  const overflow = messageLabels.length - visible.length;

  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden pr-4">
      {visible.map((label) => {
        const displayColor = resolveLabelDisplayColor(label.color);
        return (
          <span
            key={label.id}
            title={label.name}
            className="inline-flex max-w-[5.5rem] items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium leading-none"
            style={{
              color: displayColor,
              backgroundColor: `${displayColor}1a`,
              border: `1px solid ${displayColor}40`,
            }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: displayColor }}
            />
            <span className="truncate">{label.name}</span>
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

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
  relatedMessages = EMPTY_RELATED_MESSAGES,
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
  onReportSpam,
  onNotSpam,
  onBulkReportSpam,
  onSetLabel,
  labels = EMPTY_LABELS,
  timeFormat,
  timezone,
  onLoadMore,
  hasMore,
  isLoadingMore,
  density = "compact",
  showLabelChips = true,
  threadExpandEnabled = true,
  onExpandThread,
}: MessageListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBarVisible, setIsBarVisible] = useState(false);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [expandedThreadMessages, setExpandedThreadMessages] = useState<
    Record<string, JmapEmailMessage[]>
  >({});
  const [isLoadingThread, setIsLoadingThread] = useState<Set<string>>(new Set());
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentMailbox = mailboxes?.find((m) => m.id === currentMailboxId);
  const currentMailboxRole = currentMailbox?.role;
  const isInJunk = isJunkMailboxRole(currentMailboxRole);
  const isInTrash = isTrashMailboxRole(currentMailboxRole);
  const junkMailbox = findJunkMailbox(mailboxes ?? []);
  const canReportSpam =
    Boolean(onReportSpam) && !isInJunk && !isInTrash && Boolean(junkMailbox);
  const canNotSpam = Boolean(onNotSpam) && isInJunk;

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

  const toggleThreadExpand = useCallback(
    (threadId: string) => {
      setExpandedThreads((prev) => {
        const next = new Set(prev);
        if (next.has(threadId)) {
          next.delete(threadId);
        } else {
          next.add(threadId);
          if (onExpandThread && !expandedThreadMessages[threadId]) {
            setIsLoadingThread((loading) => new Set(loading).add(threadId));
            void Promise.resolve(onExpandThread(threadId))
              .then((messages) => {
                if (messages && messages.length > 0) {
                  setExpandedThreadMessages((prevMsgs) => ({
                    ...prevMsgs,
                    [threadId]: messages,
                  }));
                }
              })
              .catch(() => {
                // Non-critical
              })
              .finally(() => {
                setIsLoadingThread((loading) => {
                  const next = new Set(loading);
                  next.delete(threadId);
                  return next;
                });
              });
          }
        }
        return next;
      });
    },
    [onExpandThread, expandedThreadMessages],
  );

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
    const conversations = buildMailConversations([...messages, ...extras]);
    // Ensure latestMessage is always from the primary mailbox messages
    // (not from related/sent extras) so clicking a row selects a message
    // that exists in the current mailbox list.
    const primaryIdSet = new Set(messages.map((m) => m.id));
    return conversations
      .map((conv) => {
        const primaryMessages = conv.messages.filter((m) =>
          primaryIdSet.has(m.id),
        );
        if (primaryMessages.length === 0) {
          return null;
        }
        const latestPrimary = primaryMessages.reduce((latest, candidate) =>
          Date.parse(candidate.receivedAt ?? "") >=
          Date.parse(latest.receivedAt ?? "")
            ? candidate
            : latest,
        );
        return { ...conv, latestMessage: latestPrimary };
      })
      .filter((conv): conv is NonNullable<typeof conv> => conv !== null);
  }, [messages, relatedMessages]);

  const primaryIds = useMemo(
    () => new Set(messages.map((m) => m.id)),
    [messages],
  );

  const estimateRowSize = useCallback(
    (index: number) => {
      const row = threadRows[index];
      if (!row) return isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
      return getRowHeight(row.latestMessage, labels, isMobile, density, showLabelChips);
    },
    [threadRows, labels, isMobile, density, showLabelChips],
  );

  const virtualizer = useVirtualizer({
    count: threadRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowSize,
    overscan: 8,
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
    if (remaining <= SCROLL_LOAD_THRESHOLD * 5) {
      scheduleLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore, scheduleLoadMore]);

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
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6 safe-area-inset-bottom [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
                className="tap-target flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
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
                {canReportSpam && onBulkReportSpam ? (
                  <>
                    <div className="w-px self-stretch bg-border/60" />
                    <button
                      type="button"
                      onClick={() => {
                        onBulkReportSpam(bulkIds);
                        clearSelection();
                        setBulkActionsOpen(false);
                      }}
                      className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ShieldAlert className="size-3.5" strokeWidth={2.25} />
                      Spam
                    </button>
                  </>
                ) : null}
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
              (entry) =>
                entry.hasAttachment === true ||
                (entry.attachments?.length ?? 0) > 0,
            );
            const messageLabels = showLabelChips ? getAllMessageLabels(message, labels) : [];
            const senderLabel =
              row.messages.length > 1
                ? formatThreadSenders(row.messages)
                : formatAddress(message.from);
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
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
                      "group/row relative h-full w-full overflow-hidden text-left transition-colors cursor-pointer border-b border-border/40",
                      density === "comfortable"
                        ? isMobile ? "py-2 pl-2.5 pr-1" : "py-2 pl-2.5 pr-1"
                        : isMobile ? "py-1.5 pl-2.5 pr-1" : "py-1.5 pl-2.5 pr-1",
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

                    <div className={cn("flex items-start gap-2")}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="relative shrink-0 cursor-pointer rounded-full group/avatar"
                            onClick={(e) => toggleSelect(e, row.messageIds)}
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
                        </TooltipTrigger>
                        <TooltipContent side="right">Select message</TooltipContent>
                      </Tooltip>

                      <div className="relative min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate",
                              isMobile ? "text-[12.5px]" : "text-[13px]",
                              isRead
                                ? "font-medium text-foreground/70 dark:text-foreground/85"
                                : "font-semibold text-foreground",
                            )}
                          >
                            {senderLabel}
                          </span>
                          {!isRead && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-primary"
                              aria-label="Unread"
                              title="Unread"
                            />
                          )}
                          {hasAttachments && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex shrink-0">
                                  <Paperclip
                                    className="size-3 text-muted-foreground/60"
                                    strokeWidth={2}
                                    aria-hidden
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Has attachments</TooltipContent>
                            </Tooltip>
                          )}
                          <span className="shrink-0 text-[11px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
                            {formatMessageDate(
                              message.receivedAt,
                              timeFormat,
                              timezone,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {threadExpandEnabled && row.messages.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleThreadExpand(row.id);
                              }}
                              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                              aria-label={expandedThreads.has(row.id) ? "Collapse thread" : "Expand thread"}
                            >
                              {isLoadingThread.has(row.id) ? (
                                <RotateCcw className="size-3 animate-spin" strokeWidth={2} />
                              ) : expandedThreads.has(row.id) ? (
                                <ChevronDown className="size-3" strokeWidth={2.25} />
                              ) : (
                                <ChevronRight className="size-3" strokeWidth={2.25} />
                              )}
                            </button>
                          )}
                          {threadExpandEnabled && row.messages.length > 1 && (
                            <span className="shrink-0 text-[10px] font-medium text-muted-foreground/70 tabular-nums">
                              ({row.messages.length})
                            </span>
                          )}
                          <p
                            className={cn(
                              "truncate leading-tight",
                              isMobile ? "text-xs" : "text-[12.5px]",
                              isRead
                                ? "text-foreground/55 dark:text-foreground/65"
                                : "font-medium text-foreground/85 dark:text-foreground/90",
                            )}
                          >
                            {message.subject || "(No subject)"}
                          </p>
                        </div>
                        <MessageLabelChips messageLabels={messageLabels} />

                        {onToggleFlagged ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFlagged(message.id);
                                }}
                                className={cn(
                                  "absolute bottom-0 right-0 shrink-0 cursor-pointer p-0.5 transition-opacity",
                                  isFlagged
                                    ? "opacity-100"
                                    : "opacity-0 group-hover/row:opacity-60 hover:!opacity-100",
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
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {isFlagged ? "Remove star" : "Star message"}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
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

                  {canReportSpam && (
                    <ContextMenuItem
                      onClick={() => onReportSpam?.(message.id)}
                    >
                      <ShieldAlert />
                      Report spam
                    </ContextMenuItem>
                  )}

                  {canNotSpam && (
                    <ContextMenuItem onClick={() => onNotSpam?.(message.id)}>
                      <Inbox />
                      Not spam
                    </ContextMenuItem>
                  )}

                  {onSetLabel && labels.length > 0 && (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="gap-2">
                        <Tag />
                        Labels
                      </ContextMenuSubTrigger>
                      <ContextMenuPortal>
                        <ContextMenuSubContent className="w-44">
                          {labels.map((label) => {
                            const assigned =
                              message.keywords?.[`label:${label.id}`] === true;
                            const displayColor = resolveLabelDisplayColor(
                              label.color,
                            );
                            return (
                              <ContextMenuItem
                                key={label.id}
                                onClick={() =>
                                  onSetLabel(message.id, label.id, !assigned)
                                }
                              >
                                <span
                                  className="size-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: displayColor }}
                                />
                                <span className="flex-1 truncate">
                                  {label.name}
                                </span>
                                {assigned ? (
                                  <Check className="size-3.5 opacity-60" />
                                ) : null}
                              </ContextMenuItem>
                            );
                          })}
                        </ContextMenuSubContent>
                      </ContextMenuPortal>
                    </ContextMenuSub>
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

              {/* Expanded thread messages */}
              {threadExpandEnabled &&
                expandedThreads.has(row.id) &&
                row.messages.length > 1 && (
                  <div className="border-l-2 border-border/30 ml-2 mt-0.5 mb-1">
                    {(expandedThreadMessages[row.id] ?? row.messages)
                      .filter((m) => m.id !== message.id)
                      .map((threadMsg) => {
                        const threadRead = threadMsg.keywords?.["$seen"];
                        return (
                          <div
                            key={threadMsg.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onSelect(threadMsg.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelect(threadMsg.id);
                              }
                            }}
                            className="flex items-center gap-2 px-2.5 py-1 cursor-pointer hover:bg-muted/40 transition-colors border-b border-border/20"
                          >
                            <span
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                threadRead
                                  ? "bg-transparent"
                                  : "bg-primary",
                              )}
                            />
                            <span
                              className={cn(
                                "flex-1 min-w-0 truncate text-[11px]",
                                threadRead
                                  ? "text-foreground/50"
                                  : "font-medium text-foreground/80",
                              )}
                            >
                              {threadMsg.subject || "(No subject)"}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums whitespace-nowrap">
                              {formatMessageDate(
                                threadMsg.receivedAt,
                                timeFormat,
                                timezone,
                              )}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
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
