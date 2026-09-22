"use client";

import {
  DropdownDivider,
  DropdownItem,
  DropdownSubmenu,
  Icon,
} from "@workspace/ui/solace";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { resolveLabelDisplayColor } from "@/lib/mail/mail-label-colors";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import type {
  MessageListRowMailboxActions,
  MessageListSpamActions,
} from "./message-list-types";

export function MessageListRowContextMenu({
  message,
  messageIds,
  isRead,
  isFlagged,
  labels,
  moveTargets,
  spamActions,
  mailboxActions,
}: {
  message: JmapEmailMessage;
  messageIds: string[];
  isRead: boolean;
  isFlagged: boolean;
  labels: LabelDef[];
  moveTargets: JmapMailbox[];
  spamActions: MessageListSpamActions;
  mailboxActions: MessageListRowMailboxActions;
}) {
  const { canReportSpam, canNotSpam } = spamActions;
  const isBulk = messageIds.length > 1;
  const {
    onMarkAsUnread,
    onMarkAsRead,
    onBulkMarkAsUnread,
    onBulkMarkAsRead,
    onToggleFlagged,
    onReportSpam,
    onNotSpam,
    onSetLabel,
    onMove,
    onBulkMove,
    onDelete,
    onBulkDelete,
  } = mailboxActions;

  return (
    <>
      {isRead ? (
        <DropdownItem
          icon={Icon.EnvelopeUnread}
          label="Mark as unread"
          onSelect={() =>
            isBulk ? onBulkMarkAsUnread?.(messageIds) : onMarkAsUnread?.(message.id)
          }
        />
      ) : (
        <DropdownItem
          icon={Icon.EnvelopeRead}
          label="Mark as read"
          onSelect={() =>
            isBulk ? onBulkMarkAsRead?.(messageIds) : onMarkAsRead?.(message.id)
          }
        />
      )}
      {onToggleFlagged ? (
        <DropdownItem
          icon={Icon.Star}
          label={isFlagged ? "Remove star" : "Star"}
          onSelect={() => onToggleFlagged(message.id)}
        />
      ) : null}
      {canReportSpam ? (
        <DropdownItem
          icon={Icon.Spam}
          label="Report spam"
          onSelect={() => onReportSpam?.(message.id)}
        />
      ) : null}
      {canNotSpam ? (
        <DropdownItem
          icon={Icon.Inbox}
          label="Not spam"
          onSelect={() => onNotSpam?.(message.id)}
        />
      ) : null}
      {onSetLabel && labels.length > 0 ? (
        <DropdownSubmenu icon={Icon.Tag} label="Labels" width={200}>
          {labels.map((label) => {
            const assigned = message.keywords?.[`label:${label.id}`] === true;
            return (
              <DropdownItem
                key={label.id}
                label={label.name}
                active={assigned}
                startElement={
                  <span
                    className="mx-[3px] size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: resolveLabelDisplayColor(label.color),
                    }}
                  />
                }
                onSelect={() => onSetLabel(message.id, label.id, !assigned)}
              />
            );
          })}
        </DropdownSubmenu>
      ) : null}
      {moveTargets.length > 0 ? (
        <DropdownSubmenu icon={Icon.MoveMailbox} label="Move to" width={200}>
          {moveTargets.map((mailbox) => (
            <DropdownItem
              key={mailbox.id}
              label={getMailboxDisplayName(mailbox)}
              onSelect={() =>
                isBulk
                  ? onBulkMove?.(messageIds, mailbox.id)
                  : onMove?.(message.id, mailbox.id)
              }
            />
          ))}
        </DropdownSubmenu>
      ) : null}
      <DropdownDivider />
      <DropdownItem
        icon={Icon.Trash}
        label="Delete"
        destructive
        onSelect={() =>
          isBulk ? onBulkDelete?.(messageIds) : onDelete?.(message.id)
        }
      />
    </>
  );
}
