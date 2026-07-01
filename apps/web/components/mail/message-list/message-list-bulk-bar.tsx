"use client";

import {
  Trash2,
  FolderInput,
  MailOpen,
  MailCheck,
  MoreHorizontal,
  OctagonAlert,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import type { JmapMailbox } from "@/lib/mail/types";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";

type MessageListBulkBarProps = {
  barRef: React.RefObject<HTMLDivElement | null>;
  selectedCount: number;
  messageIds: string[];
  moveTargets: JmapMailbox[];
  canReportSpam: boolean;
  bulkActionsOpen: boolean;
  onBulkActionsOpenChange: (open: boolean) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onBulkMarkAsRead?: (ids: string[]) => void;
  onBulkMarkAsUnread?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkReportSpam?: (ids: string[]) => void;
  onBulkMove?: (ids: string[], targetMailboxId: string) => void;
};

export function MessageListBulkBar({
  barRef,
  selectedCount,
  messageIds,
  moveTargets,
  canReportSpam,
  bulkActionsOpen,
  onBulkActionsOpenChange,
  onClearSelection,
  onSelectAll,
  onBulkMarkAsRead,
  onBulkMarkAsUnread,
  onBulkDelete,
  onBulkReportSpam,
  onBulkMove,
}: MessageListBulkBarProps) {
  const finishBulkAction = (action: () => void) => {
    action();
    onClearSelection();
    onBulkActionsOpenChange(false);
  };

  return (
    <div
      ref={barRef}
      className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-background/95 backdrop-blur-sm"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onClearSelection}
          className="text-[11px] font-medium text-foreground/60 bg-muted/60 hover:bg-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
        >
          {selectedCount} selected ×
        </button>
        <button
          type="button"
          onClick={onSelectAll}
          className="text-[11px] font-medium text-foreground/60 bg-muted/60 hover:bg-muted hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
        >
          Select all
        </button>
      </div>
      <Popover open={bulkActionsOpen} onOpenChange={onBulkActionsOpenChange}>
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
              onClick={() =>
                finishBulkAction(() => onBulkMarkAsRead?.(messageIds))
              }
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MailCheck className="size-3.5" strokeWidth={2.25} />
              Read
            </button>
            <div className="w-px self-stretch bg-border/60" />
            <button
              type="button"
              onClick={() =>
                finishBulkAction(() => onBulkMarkAsUnread?.(messageIds))
              }
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MailOpen className="size-3.5" strokeWidth={2.25} />
              Unread
            </button>
            <div className="w-px self-stretch bg-border/60" />
            <button
              type="button"
              onClick={() => finishBulkAction(() => onBulkDelete?.(messageIds))}
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
                  onClick={() =>
                    finishBulkAction(() => onBulkReportSpam(messageIds))
                  }
                  className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <OctagonAlert className="size-3.5" strokeWidth={2.25} />
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
                  onClick={() =>
                    finishBulkAction(() => onBulkMove?.(messageIds, mailbox.id))
                  }
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  <FolderInput className="size-3.5" strokeWidth={2.25} />
                  <span className="truncate">{getMailboxDisplayName(mailbox)}</span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
