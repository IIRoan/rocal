import type { MailConversation } from "./conversation-thread";
import { messageHasVisibleAttachments } from "./message-security";

export interface MailThreadRowState {
  unreadCount: number;
  hasAttachments: boolean;
  selectableIds: string[];
  selected: boolean;
}

// Companion-folder replies render in the row but cannot be selected, so a thread without selectable ids falls back to its latest message.
export function getThreadRowState(
  row: MailConversation,
  primaryMessageIds: Set<string>,
  selectedIds: Set<string>,
): MailThreadRowState {
  const unreadCount = row.messages.filter(
    (entry) => primaryMessageIds.has(entry.id) && !entry.keywords?.["$seen"],
  ).length;
  const selectableIds = row.messageIds.filter((id) =>
    primaryMessageIds.has(id),
  );
  const selectedCount = selectableIds.filter((id) =>
    selectedIds.has(id),
  ).length;

  return {
    unreadCount,
    hasAttachments: row.messages.some((entry) =>
      messageHasVisibleAttachments(entry),
    ),
    selectableIds,
    selected:
      selectedCount > 0 ||
      (selectableIds.length === 0 && selectedIds.has(row.latestMessage.id)),
  };
}
