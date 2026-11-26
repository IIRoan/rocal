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

/** Checked conversations, or the one open in the reader when nothing is checked. */
export type MessageListBarTarget =
  | { kind: "selection"; messageIds: string[] }
  | { kind: "open"; messageIds: string[]; subject: string; isRead: boolean };

type MessageListBulkBarProps = {
  barRef: React.RefObject<HTMLDivElement | null>;
  target: MessageListBarTarget;
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
  onMarkAsRead?: (id: string) => void;
  onMarkAsUnread?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReportSpam?: (id: string) => void;
  onMove?: (id: string, targetMailboxId: string) => void;
};

export function MessageListBulkBar({
  barRef,
  target,
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
  onMarkAsRead,
  onMarkAsUnread,
  onDelete,
  onReportSpam,
  onMove,
}: MessageListBulkBarProps) {
  const { messageIds } = target;
  const selection = target.kind === "selection";
  const selected = new Set(selection ? messageIds : []);
  const allSelected = allMessageIds.every((id) => selected.has(id));
  // A one-message conversation takes the single-message actions, which also keep an open message unread.
  const single = !selection && messageIds.length === 1 ? messageIds[0] : undefined;
  const run = (bulk?: (ids: string[]) => void, one?: (id: string) => void) => {
    if (single && one) one(single);
    else bulk?.(messageIds);
  };

  const finishBulkAction = (action: () => void) => {
    action();
    onClearSelection();
    onBulkActionsOpenChange(false);
  };

  const iconButton = {
    size: Size.SMALL,
    type: Type.TERTIARY,
    variant: FilledVariant.UNFILLED,
  } as const;

  // Floats over the bottom of the list so it never pushes the rows down.
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
      <WarmTooltipGroup lean={8}>
        <div
          ref={barRef}
          className="pointer-events-auto flex max-w-full min-w-0 items-center gap-0.5 rounded-[14px] border border-[var(--border-secondary)] bg-[var(--bg-l3-solid)] py-1 pr-1 pl-1.5 shadow-[var(--shadow-l2)]"
        >
          <IconButton
            {...iconButton}
            icon={allSelected ? Icon.CheckboxFilled : Icon.CheckboxEmpty}
            onClick={allSelected ? onClearSelection : onSelectAll}
            tooltip={allSelected ? "Clear selection" : "Select all"}
          />
          <span className="mr-1.5 ml-0.5 min-w-0 truncate text-[13px] font-medium whitespace-nowrap tabular-nums text-[var(--text-primary)]">
            {selection ? (
              `${messageIds.length} selected`
            ) : (
              <>
                <span className="sr-only">Open conversation: </span>
                {target.subject}
              </>
            )}
          </span>
          {selection || target.isRead ? null : (
            <IconButton
              {...iconButton}
              icon={Icon.EnvelopeRead}
              onClick={() => finishBulkAction(() => run(onBulkMarkAsRead, onMarkAsRead))}
              tooltip="Mark as read"
            />
          )}
          {selection ? (
            <IconButton
              {...iconButton}
              icon={Icon.EnvelopeRead}
              onClick={() => finishBulkAction(() => run(onBulkMarkAsRead, onMarkAsRead))}
              tooltip="Mark as read"
            />
          ) : null}
          {selection || target.isRead ? (
            <IconButton
              {...iconButton}
              icon={Icon.EnvelopeUnread}
              onClick={() => finishBulkAction(() => run(onBulkMarkAsUnread, onMarkAsUnread))}
              tooltip="Mark as unread"
            />
          ) : null}
          {moveTargets.length > 0 ? (
            <Dropdown
              open={bulkActionsOpen}
              onOpenChange={onBulkActionsOpenChange}
              align="center"
              side="top"
              width={208}
              trigger={
                <IconButton
                  {...iconButton}
                  icon={Icon.MoveMailbox}
                  onClick={() => undefined}
                  tooltip="Move to"
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
                      finishBulkAction(() =>
                        single && onMove ? onMove(single, mailbox.id) : onBulkMove?.(messageIds, mailbox.id),
                      )
                    }
                  />
                ))}
              </DropdownSection>
            </Dropdown>
          ) : null}
          {canReportSpam && (onBulkReportSpam || onReportSpam) ? (
            <IconButton
              {...iconButton}
              icon={Icon.Spam}
              onClick={() => finishBulkAction(() => run(onBulkReportSpam, onReportSpam))}
              tooltip="Report spam"
            />
          ) : null}
          <IconButton
            {...iconButton}
            type={Type.DESTRUCTIVE}
            icon={Icon.Trash}
            onClick={() => finishBulkAction(() => run(onBulkDelete, onDelete))}
            tooltip="Delete"
          />
          {selection ? (
            <>
              <span aria-hidden className="mx-1 h-4 w-px bg-[var(--border-secondary)]" />
              <IconButton {...iconButton} icon={Icon.Close} onClick={onClearSelection} tooltip="Clear selection" />
            </>
          ) : null}
        </div>
      </WarmTooltipGroup>
    </div>
  );
}
