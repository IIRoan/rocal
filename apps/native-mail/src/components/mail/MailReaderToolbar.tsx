import {
  MailBottomAction,
  MailBottomActionBar,
  MailBottomActionDivider,
} from "./MailBottomActionBar";
import type { MailMessageActions } from "../../hooks/use-mail-message-actions";

interface MailReaderToolbarProps {
  bottomInset: number;
  actions: MailMessageActions;
}

export function MailReaderToolbar({
  bottomInset,
  actions,
}: MailReaderToolbarProps) {
  const busy = actions.isActionBusy;
  const isTrash = actions.currentMailboxRole === "trash";

  return (
    <MailBottomActionBar bottomInset={bottomInset}>
      <MailBottomAction
        icon="trash-2"
        label={isTrash ? "Delete" : "Trash"}
        destructive
        disabled={busy}
        onPress={actions.handleMoveToTrash}
      />
      <MailBottomActionDivider />
      <MailBottomAction
        icon="folder"
        label="Move"
        disabled={busy || actions.moveTargets.length === 0}
        onPress={() => actions.setActiveSheetView("move")}
      />
      <MailBottomActionDivider />
      <MailBottomAction
        icon="mail"
        label="Unread"
        disabled={busy || !actions.isSeen}
        onPress={actions.handleMarkUnread}
      />
      <MailBottomActionDivider />
      <MailBottomAction
        icon="tag"
        label="Labels"
        disabled={busy}
        onPress={() => actions.setActiveSheetView("label")}
      />
      <MailBottomActionDivider />
      <MailBottomAction
        icon="more-horizontal"
        label="More"
        disabled={busy}
        onPress={() => actions.setActiveSheetView("menu")}
      />
    </MailBottomActionBar>
  );
}
