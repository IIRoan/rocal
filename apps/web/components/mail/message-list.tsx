"use client";

import { useState, useEffect } from "react";
import { Trash2, FolderInput, MailOpen, MailCheck, CheckSquare, Square } from "lucide-react";
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
import type { JmapEmailMessage, JmapMailbox } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "./mail-helpers";
import { SenderAvatar } from "./mail-avatar";

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
}: MessageListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentMailboxId]);

  const moveTargets = (mailboxes ?? []).filter(
    (m) => m.id !== currentMailboxId && !MOVE_EXCLUDED_ROLES.has(m.role?.toLowerCase() ?? ""),
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

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No messages</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {hasBulkSelection && (
        <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 border-b border-border/40 bg-background/95 backdrop-blur-sm">
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11px] text-muted-foreground/70 font-medium hover:text-foreground transition-colors shrink-0"
          >
            {selectedIds.size} selected ×
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(messages.map((m) => m.id)))}
            className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors shrink-0 ml-1"
          >
            Select all
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => { onBulkMarkAsRead?.(bulkIds); clearSelection(); }}
            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
          >
            <MailCheck className="h-3 w-3" strokeWidth={2.25} />
            Read
          </button>
          <button
            type="button"
            onClick={() => { onBulkMarkAsUnread?.(bulkIds); clearSelection(); }}
            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
          >
            <MailOpen className="h-3 w-3" strokeWidth={2.25} />
            Unread
          </button>
          {moveTargets.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
                >
                  <FolderInput className="h-3 w-3" strokeWidth={2.25} />
                  Move
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" sideOffset={4} className="w-44 p-1">
                {moveTargets.map((mailbox) => (
                  <button
                    key={mailbox.id}
                    type="button"
                    onClick={() => { onBulkMove?.(bulkIds, mailbox.id); clearSelection(); }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-foreground/80 hover:bg-accent/50 transition-colors text-left"
                  >
                    {mailbox.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <button
            type="button"
            onClick={() => { onBulkDelete?.(bulkIds); clearSelection(); }}
            className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2.25} />
            Delete
          </button>
        </div>
      )}

      <div className="flex flex-col divide-y divide-border/40">
        {messages.map((message) => {
          const isSelected = message.id === selectedMessageId;
          const isChecked = selectedIds.has(message.id);
          const isRead = message.keywords?.["$seen"] === true;
          return (
            <ContextMenu key={message.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(message.id)}
                  className={`group/row w-full px-3 py-2.5 text-left transition-colors data-[state=open]:bg-muted/60 data-[state=open]:ring-1 data-[state=open]:ring-inset data-[state=open]:ring-border/60 ${isChecked ? "bg-primary/5" : isSelected ? "bg-muted/80" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <SenderAvatar
                      email={message.from?.[0]?.email ?? ""}
                      name={message.from?.[0]?.name ?? undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Fixed-width slot: unread dot crossfades with checkbox on hover/select */}
                          <span className="relative shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                            {!isRead && (
                              <span
                                className={`absolute h-1.5 w-1.5 rounded-full bg-primary transition-opacity ${isChecked ? "opacity-0" : "opacity-100 group-hover/row:opacity-0"}`}
                                aria-label="Unread"
                              />
                            )}
                            <span
                              onClick={(e) => toggleSelect(e, message.id)}
                              className={`absolute cursor-pointer transition-opacity ${isChecked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"}`}
                            >
                              {isChecked
                                ? <CheckSquare className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
                                : <Square className="h-3.5 w-3.5 text-muted-foreground/50" strokeWidth={2.25} />}
                            </span>
                          </span>
                          <span className={`text-[13px] truncate ${isRead ? "font-medium text-foreground/70" : "font-semibold text-foreground"}`}>
                            {formatAddress(message.from)}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground/70 shrink-0">
                          {formatMessageDate(message.receivedAt)}
                        </span>
                      </div>
                      <p className={`text-[13px] truncate pl-5 ${isRead ? "text-foreground/50" : "text-foreground/80"}`}>
                        {message.subject || "(No subject)"}
                      </p>
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
        })}
      </div>
    </div>
  );
}
