"use client";

import { useState, useEffect, useRef } from "react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "./mail-helpers";
import { SenderAvatar } from "./mail-avatar";
import { filterMessages } from "@/lib/mail/message-filter";

const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);

interface MessageListProps {
  messages: JmapEmailMessage[];
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

export function MessageList({
  messages,
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
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setSearchQuery("");
  }, [currentMailboxId]);

  const moveTargets = (mailboxes ?? []).filter(
    (m) =>
      m.id !== currentMailboxId &&
      !MOVE_EXCLUDED_ROLES.has(m.role?.toLowerCase() ?? ""),
  );

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkIds = Array.from(selectedIds);
  const hasBulkSelection = selectedIds.size > 0;

  useEffect(() => {
    if (hasBulkSelection) setIsBarVisible(true);
  }, [hasBulkSelection]);

  useGSAP(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (hasBulkSelection) {
      gsap.fromTo(bar,
        { y: -6, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.22, ease: "power2.out" }
      );
    } else if (isBarVisible) {
      gsap.to(bar, {
        y: -6, opacity: 0, duration: 0.16, ease: "power2.in",
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
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" strokeWidth={2} />
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-40">
              <DropdownMenuItem onClick={() => { onBulkMarkAsRead?.(bulkIds); clearSelection(); }}>
                <MailCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                Mark as read
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { onBulkMarkAsUnread?.(bulkIds); clearSelection(); }}>
                <MailOpen className="h-3.5 w-3.5" strokeWidth={2.25} />
                Mark as unread
              </DropdownMenuItem>
              {moveTargets.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Move to
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-40">
                      {moveTargets.map((mailbox) => (
                        <DropdownMenuItem
                          key={mailbox.id}
                          onClick={() => { onBulkMove?.(bulkIds, mailbox.id); clearSelection(); }}
                        >
                          {mailbox.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => { onBulkDelete?.(bulkIds); clearSelection(); }}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border/40">
        {visibleMessages.length === 0 && searchQuery ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No results for "{searchQuery}"</p>
          </div>
        ) : (
          visibleMessages.map((message) => {
          const isSelected = message.id === selectedMessageId;
          const isChecked = selectedIds.has(message.id);
          const isRead = message.keywords?.["$seen"] === true;
          const isFlagged = message.keywords?.["$flagged"] === true;
          const messageLabels = labels.filter(
            (l) => message.keywords?.[`label:${l.id}`] === true,
          );
          return (
            <ContextMenu key={message.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(message.id)}
                  className={`group/row w-full px-3 py-2.5 text-left transition-colors data-[state=open]:bg-muted/60 data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-border/60 ${isChecked ? "bg-primary/5 dark:bg-primary/10" : isSelected ? "bg-muted/80 dark:bg-muted" : "hover:bg-muted/40 dark:hover:bg-muted/60"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="relative shrink-0 cursor-pointer p-2 -m-2 rounded-full"
                      onClick={(e) => toggleSelect(e, message.id)}
                    >
                      <SenderAvatar
                        email={message.from?.[0]?.email ?? ""}
                        name={message.from?.[0]?.name ?? undefined}
                      />
                      <span
                        className={`absolute inset-0 rounded-full flex items-center justify-center bg-background/80 transition-opacity ${isChecked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`}
                      >
                        {isChecked ? (
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
                          {formatAddress(message.from)}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isRead && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          )}
                          <span className="text-[11px] text-muted-foreground/70 dark:text-muted-foreground/90">
                            {formatMessageDate(message.receivedAt, timeFormat, timezone)}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); onToggleFlagged?.(message.id); }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onToggleFlagged?.(message.id); } }}
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
                              style={{ backgroundColor: `${label.color}20`, color: label.color }}
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
                  <ContextMenuItem onClick={() => onMarkAsUnread?.(message.id)}>
                    <MailOpen />
                    Mark as unread
                  </ContextMenuItem>
                ) : (
                  <ContextMenuItem onClick={() => onMarkAsRead?.(message.id)}>
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
                            onClick={() => onMove?.(message.id, mailbox.id)}
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
                  onClick={() => onDelete?.(message.id)}
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
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {isLoadingMore && (
            <span className="text-xs text-muted-foreground/50">Loading…</span>
          )}
        </div>
      )}
    </div>
  );
}
