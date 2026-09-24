"use client";

import {
  FilledVariant,
  Icon,
  IconButton,
  Size,
  Type,
  WarmTooltipGroup,
} from "@workspace/ui/solace";

export function MessageListRowHoverActions({
  isRead,
  isFlagged,
  isBulk,
  messageId,
  messageIds,
  onMarkAsUnread,
  onMarkAsRead,
  onBulkMarkAsUnread,
  onBulkMarkAsRead,
  onDelete,
  onBulkDelete,
  onToggleFlagged,
}: {
  isRead: boolean;
  isFlagged: boolean;
  isBulk: boolean;
  messageId: string;
  messageIds: string[];
  onMarkAsUnread?: (id: string) => void;
  onMarkAsRead?: (id: string) => void;
  onBulkMarkAsUnread?: (ids: string[]) => void;
  onBulkMarkAsRead?: (ids: string[]) => void;
  onDelete?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onToggleFlagged?: (id: string) => void;
}) {
  return (
    <WarmTooltipGroup lean={8}>
    <div className="hidden h-6 items-center gap-1.5 transition-opacity duration-150 ease-in-out group-hover/row:flex starting:opacity-0">
      {isRead
        ? onMarkAsUnread && (
            <IconButton
              icon={Icon.EnvelopeUnread}
              onClick={(event) => {
                event.stopPropagation();
                isBulk ? onBulkMarkAsUnread?.(messageIds) : onMarkAsUnread(messageId);
              }}
              size={Size.SMALL}
              tooltip="Mark as unread"
              type={Type.SECONDARY}
              variant={FilledVariant.UNFILLED}
            />
          )
        : onMarkAsRead && (
            <IconButton
              icon={Icon.EnvelopeRead}
              onClick={(event) => {
                event.stopPropagation();
                isBulk ? onBulkMarkAsRead?.(messageIds) : onMarkAsRead(messageId);
              }}
              size={Size.SMALL}
              tooltip="Mark as read"
              type={Type.SECONDARY}
              variant={FilledVariant.UNFILLED}
            />
          )}
      {onDelete ? (
        <IconButton
          icon={Icon.Trash}
          onClick={(event) => {
            event.stopPropagation();
            isBulk ? onBulkDelete?.(messageIds) : onDelete(messageId);
          }}
          size={Size.SMALL}
          tooltip="Trash"
          type={Type.SECONDARY}
          variant={FilledVariant.UNFILLED}
        />
      ) : null}
      {onToggleFlagged ? (
        <IconButton
          icon={Icon.Star}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFlagged(messageId);
          }}
          size={Size.SMALL}
          tooltip={isFlagged ? "Unstar" : "Star"}
          type={Type.SECONDARY}
          variant={FilledVariant.UNFILLED}
        />
      ) : null}
    </div>
    </WarmTooltipGroup>
  );
}
