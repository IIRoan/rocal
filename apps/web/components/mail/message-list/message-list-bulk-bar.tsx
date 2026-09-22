"use client";

import {
  Dropdown,
  DropdownItem,
  DropdownSection,
  FilledVariant,
  Icon,
  IconButton,
  Size,
  Type,
  WarmTooltipGroup,
} from "@workspace/ui/solace";
import type { JmapMailbox } from "@/lib/mail/types";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";

type MessageListBulkBarProps = {
  barRef: React.RefObject<HTMLDivElement | null>;
  selectedCount: number;
  messageIds: string[];
  allMessageIds: string[];
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
  allMessageIds,
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
  const selected = new Set(messageIds);
  const allSelected = allMessageIds.every((id) => selected.has(id));

  const finishBulkAction = (action: () => void) => {
    action();
    onClearSelection();
    onBulkActionsOpenChange(false);
  };

  return (
    <WarmTooltipGroup lean={8}>
      <div
        ref={barRef}
        className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-[var(--border-secondary)] bg-[var(--bg-l2-solid)] px-5"
      >
        <IconButton
          icon={allSelected ? Icon.CheckboxFilled : Icon.CheckboxEmpty}
          onClick={allSelected ? onClearSelection : onSelectAll}
          size={Size.SMALL}
          tooltip={allSelected ? "Clear selection" : "Select all"}
          type={Type.TERTIARY}
          variant={FilledVariant.UNFILLED}
        />
        <IconButton
          icon={Icon.EnvelopeRead}
          onClick={() => finishBulkAction(() => onBulkMarkAsRead?.(messageIds))}
          size={Size.SMALL}
          tooltip="Mark as read"
          type={Type.TERTIARY}
          variant={FilledVariant.UNFILLED}
        />
        <IconButton
          icon={Icon.EnvelopeUnread}
          onClick={() =>
            finishBulkAction(() => onBulkMarkAsUnread?.(messageIds))
          }
          size={Size.SMALL}
          tooltip="Mark as unread"
          type={Type.TERTIARY}
          variant={FilledVariant.UNFILLED}
        />
        <IconButton
          icon={Icon.Trash}
          onClick={() => finishBulkAction(() => onBulkDelete?.(messageIds))}
          size={Size.SMALL}
          tooltip="Delete"
          type={Type.DESTRUCTIVE}
          variant={FilledVariant.UNFILLED}
        />
        {canReportSpam && onBulkReportSpam ? (
          <IconButton
            icon={Icon.Spam}
            onClick={() => finishBulkAction(() => onBulkReportSpam(messageIds))}
            size={Size.SMALL}
            tooltip="Report spam"
            type={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
        ) : null}
        {moveTargets.length > 0 ? (
          <Dropdown
            open={bulkActionsOpen}
            onOpenChange={onBulkActionsOpenChange}
            align="start"
            width={208}
            trigger={
              <IconButton
                icon={Icon.MoveMailbox}
                onClick={() => undefined}
                size={Size.SMALL}
                tooltip="Move to"
                type={Type.TERTIARY}
                variant={FilledVariant.UNFILLED}
              />
            }
          >
            <DropdownSection label="Move to">
              {moveTargets.map((mailbox) => (
                <DropdownItem
                  key={mailbox.id}
                  icon={Icon.Folder}
                  label={getMailboxDisplayName(mailbox)}
                  onSelect={() =>
                    finishBulkAction(() => onBulkMove?.(messageIds, mailbox.id))
                  }
                />
              ))}
            </DropdownSection>
          </Dropdown>
        ) : null}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-wide text-[var(--text-disabled)]">
          {selectedCount} selected
        </span>
      </div>
    </WarmTooltipGroup>
  );
}
