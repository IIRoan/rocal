import React from "react";
import {
  MailBottomAction,
  MailBottomActionBar,
  MailBottomActionDivider,
} from "./MailBottomActionBar";

interface MailBulkToolbarProps {
  bottomInset: number;
  isInTrash: boolean;
  canMarkRead: boolean;
  canMarkUnread: boolean;
  busy?: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onTrash: () => void;
  onMore: () => void;
}

export function MailBulkToolbar({
  bottomInset,
  isInTrash,
  canMarkRead,
  canMarkUnread,
  busy = false,
  onMarkRead,
  onMarkUnread,
  onTrash,
  onMore,
}: MailBulkToolbarProps) {
  return (
    <MailBottomActionBar bottomInset={bottomInset}>
      <MailBottomAction
        icon="check-circle"
        label="Read"
        disabled={busy || !canMarkRead}
        onPress={onMarkRead}
      />
      <MailBottomActionDivider />
      <MailBottomAction
        icon="mail"
        label="Unread"
        disabled={busy || !canMarkUnread}
        onPress={onMarkUnread}
      />
      <MailBottomActionDivider />
      <MailBottomAction
        icon="trash-2"
        label={isInTrash ? "Delete" : "Trash"}
        destructive
        disabled={busy}
        onPress={onTrash}
      />
      <MailBottomActionDivider />
      <MailBottomAction
        icon="more-horizontal"
        label="More"
        disabled={busy}
        onPress={onMore}
      />
    </MailBottomActionBar>
  );
}
