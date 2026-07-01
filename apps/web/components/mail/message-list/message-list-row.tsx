"use client";

import {
  Trash2,
  FolderInput,
  MailOpen,
  MailCheck,
  CheckSquare,
  Square,
  Star,
  Paperclip,
  OctagonAlert,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "../mail-helpers";
import { SenderAvatar } from "../mail-avatar";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import { resolveLabelDisplayColor } from "@/lib/mail/mail-label-colors";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import {
  formatThreadSenders,
  getSecondaryThreadMessages,
  type MessageListThreadRow,
} from "./message-list-utils";

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

export type MessageListRowProps = {
  row: MessageListThreadRow;
  primaryIds: Set<string>;
  selectedMessageId: string | null;
  selectedIds: Set<string>;
  expandedThreads: Set<string>;
  expandedThreadMessages: Record<string, JmapEmailMessage[]>;
  isLoadingThread: Set<string>;
  labels: LabelDef[];
  moveTargets: JmapMailbox[];
  canReportSpam: boolean;
  canNotSpam: boolean;
  isMobile: boolean;
  density: "compact" | "comfortable";
  showLabelChips: boolean;
  threadExpandEnabled: boolean;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  onSelect: (id: string) => void;
  onToggleSelect: (event: React.MouseEvent, ids: string[]) => void;
  onToggleThreadExpand: (threadId: string) => void;
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
  onSetLabel?: (messageId: string, labelId: string, assigned: boolean) => void;
};

export function MessageListRow({
  row,
  primaryIds,
  selectedMessageId,
  selectedIds,
  expandedThreads,
  expandedThreadMessages,
  isLoadingThread,
  labels,
  moveTargets,
  canReportSpam,
  canNotSpam,
  isMobile,
  density,
  showLabelChips,
  threadExpandEnabled,
  timeFormat,
  timezone,
  onSelect,
  onToggleSelect,
  onToggleThreadExpand,
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
  onSetLabel,
}: MessageListRowProps) {
  const message = row.latestMessage;
  const isSelected = row.messageIds.includes(selectedMessageId ?? "");
  const selectedCount = row.messageIds.filter((id) => selectedIds.has(id)).length;
  const isChecked = selectedCount === row.messageIds.length;
  const primaryMessages = row.messages.filter((entry) => primaryIds.has(entry.id));
  const unreadCount = primaryMessages.filter(
    (entry) => !entry.keywords?.["$seen"],
  ).length;
  const isRead = unreadCount === 0;
  const isFlagged = row.messages.some(
    (entry) => entry.keywords?.["$flagged"] === true,
  );
  const hasAttachments = row.messages.some(
    (entry) =>
      entry.hasAttachment === true || (entry.attachments?.length ?? 0) > 0,
  );
  const messageLabels = showLabelChips
    ? getAllMessageLabels(message, labels)
    : [];
  const senderLabel =
    row.messages.length > 1
      ? formatThreadSenders(row.messages)
      : formatAddress(message.from);
  const secondaryThreadMessages = getSecondaryThreadMessages(
    expandedThreadMessages[row.id] ?? row.messages,
    message.id,
  );

  return (
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
              ? "py-2 pl-2.5 pr-1"
              : "py-1.5 pl-2.5 pr-1",
            "data-[state=open]:bg-muted/60",
            isChecked
              ? "bg-primary/5 dark:bg-primary/10"
              : isSelected
                ? "bg-muted/70 dark:bg-muted/50"
                : "hover:bg-muted/40 dark:hover:bg-muted/50",
          )}
        >
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

          <div className="flex items-start gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="relative shrink-0 cursor-pointer rounded-full group/avatar"
                  onClick={(event) => onToggleSelect(event, row.messageIds)}
                  aria-label="Select message"
                >
                  <SenderAvatar
                    email={message.from?.[0]?.email ?? ""}
                    name={message.from?.[0]?.name ?? undefined}
                  />
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
                  {formatMessageDate(message.receivedAt, timeFormat, timezone)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {threadExpandEnabled && row.messages.length > 1 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleThreadExpand(row.id);
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    aria-label={
                      expandedThreads.has(row.id)
                        ? "Collapse thread"
                        : "Expand thread"
                    }
                  >
                    {isLoadingThread.has(row.id) ? (
                      <RotateCcw
                        className="size-3 animate-spin"
                        strokeWidth={2}
                      />
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
                      onClick={(event) => {
                        event.stopPropagation();
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
          <ContextMenuItem onClick={() => onToggleFlagged(message.id)}>
            <Star
              className={isFlagged ? "fill-amber-400 text-amber-400" : ""}
              strokeWidth={2}
            />
            {isFlagged ? "Remove star" : "Star"}
          </ContextMenuItem>
        )}

        {canReportSpam && (
          <ContextMenuItem onClick={() => onReportSpam?.(message.id)}>
            <OctagonAlert />
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
                  const displayColor = resolveLabelDisplayColor(label.color);
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
                      <span className="flex-1 truncate">{label.name}</span>
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
                    {getMailboxDisplayName(mailbox)}
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

      {threadExpandEnabled &&
        expandedThreads.has(row.id) &&
        row.messages.length > 1 && (
          <div className="border-l-2 border-border/30 ml-2 mt-0.5 mb-1">
            {secondaryThreadMessages.map((threadMsg) => {
              const threadRead = threadMsg.keywords?.["$seen"];
              return (
                <button
                  key={threadMsg.id}
                  type="button"
                  onClick={() => onSelect(threadMsg.id)}
                  className="flex w-full items-center gap-2 px-2.5 py-1 cursor-pointer text-left hover:bg-muted/40 transition-colors border-b border-border/20"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      threadRead ? "bg-transparent" : "bg-primary",
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
                </button>
              );
            })}
          </div>
        )}
    </ContextMenu>
  );
}
