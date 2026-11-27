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

const ICON_BUTTON = {
  size: Size.SMALL,
  type: Type.TERTIARY,
  variant: FilledVariant.UNFILLED,
} as const;

function BarLabel({ target }: { target: MessageListBarTarget }) {
  return (
    <span className="mr-1.5 ml-0.5 min-w-0 truncate text-[13px] font-medium whitespace-nowrap tabular-nums text-[var(--text-primary)]">
      {target.kind === "selection" ? (
        `${target.messageIds.length} selected`
      ) : (
        <>
          <span className="sr-only">Open conversation: </span>
          {target.subject}
        </>
      )}
    </span>
  );
}

/** A selection offers both; the open conversation offers whichever it needs. */
function BarReadButtons({
  target,
  onRead,
  onUnread,
}: {
  target: MessageListBarTarget;
  onRead: () => void;
  onUnread: () => void;
}) {
  const showRead = target.kind === "selection" || !target.isRead;
  const showUnread = target.kind === "selection" || target.isRead;
  return (
    <>
      {showRead ? <IconButton {...ICON_BUTTON} icon={Icon.EnvelopeRead} onClick={onRead} tooltip="Mark as read" /> : null}
      {showUnread ? (
        <IconButton {...ICON_BUTTON} icon={Icon.EnvelopeUnread} onClick={onUnread} tooltip="Mark as unread" />
      ) : null}
    </>
  );
}

function BarMoveMenu({
  moveTargets,
  open,
  onOpenChange,
  onMove,
}: {
  moveTargets: JmapMailbox[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (mailboxId: string) => void;
}) {
  if (moveTargets.length === 0) return null;
  return (
    <Dropdown
      open={open}
      onOpenChange={onOpenChange}
      align="center"
      side="top"
      width={208}
      trigger={<IconButton {...ICON_BUTTON} icon={Icon.MoveMailbox} onClick={() => undefined} tooltip="Move to" />}
    >
      <DropdownSection label="Move to">
        {moveTargets.map((mailbox) => (
          <DropdownItem
            key={mailbox.id}
            icon={Icon.Folder}
            label={getMailboxDisplayName(mailbox)}
            onSelect={() => onMove(mailbox.id)}
          />
        ))}
      </DropdownSection>
    </Dropdown>
  );
}

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
  const checked = new Set(selection ? messageIds : []);
  const allSelected = selection && allMessageIds.every((id) => checked.has(id));
  // A one-message conversation takes the single-message actions, which also keep an open message unread.
  const single = !selection && messageIds.length === 1 ? messageIds[0] : undefined;
  const finish = (bulk?: (ids: string[]) => void, one?: (id: string) => void) => {
    if (single && one) one(single);
    else bulk?.(messageIds);
    onClearSelection();
    onBulkActionsOpenChange(false);
  };

  // Floats over the bottom of the list so it never pushes the rows down.
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
      <WarmTooltipGroup lean={8}>
        <div
          ref={barRef}
          className="pointer-events-auto flex max-w-full min-w-0 items-center gap-0.5 rounded-[14px] border border-[var(--border-secondary)] bg-[var(--bg-l3-solid)] py-1 pr-1 pl-1.5 shadow-[var(--shadow-l2)]"
        >
          <IconButton
            {...ICON_BUTTON}
            icon={allSelected ? Icon.CheckboxFilled : Icon.CheckboxEmpty}
            onClick={allSelected ? onClearSelection : onSelectAll}
            tooltip={allSelected ? "Clear selection" : "Select all"}
          />
          <BarLabel target={target} />
          <BarReadButtons
            target={target}
            onRead={() => finish(onBulkMarkAsRead, onMarkAsRead)}
            onUnread={() => finish(onBulkMarkAsUnread, onMarkAsUnread)}
          />
          <BarMoveMenu
            moveTargets={moveTargets}
            open={bulkActionsOpen}
            onOpenChange={onBulkActionsOpenChange}
            onMove={(mailboxId) =>
              finish(
                (ids) => onBulkMove?.(ids, mailboxId),
                onMove ? (id) => onMove(id, mailboxId) : undefined,
              )
            }
          />
          {canReportSpam && (onBulkReportSpam || onReportSpam) ? (
            <IconButton
              {...ICON_BUTTON}
              icon={Icon.Spam}
              onClick={() => finish(onBulkReportSpam, onReportSpam)}
              tooltip="Report spam"
            />
          ) : null}
          <IconButton
            {...ICON_BUTTON}
            type={Type.DESTRUCTIVE}
            icon={Icon.Trash}
            onClick={() => finish(onBulkDelete, onDelete)}
            tooltip="Delete"
          />
          {selection ? (
            <>
              <span aria-hidden className="mx-1 h-4 w-px bg-[var(--border-secondary)]" />
              <IconButton {...ICON_BUTTON} icon={Icon.Close} onClick={onClearSelection} tooltip="Clear selection" />
            </>
          ) : null}
        </div>
      </WarmTooltipGroup>
    </div>
  );
}
