import { useState } from "react";
import type { MailConversation } from "../lib/mail/conversation-thread";
import type { JmapEmailMessage } from "../lib/mail/types";

interface MailListSelectionParams {
  mailboxMessages: JmapEmailMessage[];
  searchMessages: JmapEmailMessage[];
  conversationExtras: JmapEmailMessage[];
  threadRows: MailConversation[];
  /** Ids that live in the open mailbox; companion-folder replies render but cannot be selected. */
  primaryMessageIds: Set<string>;
}

/** Loaded list and search rows win over conversation extras with the same id. */
function indexMessagesById(
  listed: JmapEmailMessage[],
  extras: JmapEmailMessage[],
): Map<string, JmapEmailMessage> {
  const map = new Map<string, JmapEmailMessage>();
  for (const message of listed) map.set(message.id, message);
  for (const message of extras) {
    if (!map.has(message.id)) map.set(message.id, message);
  }
  return map;
}

export function useMailListSelection({
  mailboxMessages,
  searchMessages,
  conversationExtras,
  threadRows,
  primaryMessageIds,
}: MailListSelectionParams) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectableIds = threadRows.flatMap((row) =>
    row.messageIds.filter((id) => primaryMessageIds.has(id)),
  );

  const messageById = indexMessagesById(
    [...mailboxMessages, ...searchMessages],
    conversationExtras,
  );

  const bulkIds = Array.from(selectedIds);

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const toggleThreadSelection = (messageIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = messageIds.every((id) => next.has(id));
      for (const id of messageIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  };

  const handleToggleSelect = (message: JmapEmailMessage, rowSelectableIds: string[]) => {
    toggleThreadSelection(
      rowSelectableIds.length > 0 ? rowSelectableIds : [message.id],
    );
  };

  const handleSelectAll = () => {
    const allSelected =
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const keywordGroups = {
    unreadSelectedIds: bulkIds.filter(
      (id) => !messageById.get(id)?.keywords?.["$seen"],
    ),
    readSelectedIds: bulkIds.filter(
      (id) => messageById.get(id)?.keywords?.["$seen"],
    ),
    unflaggedSelectedIds: bulkIds.filter(
      (id) => !messageById.get(id)?.keywords?.["$flagged"],
    ),
    flaggedSelectedIds: bulkIds.filter(
      (id) => messageById.get(id)?.keywords?.["$flagged"],
    ),
  };

  return {
    selectedIds,
    selectionActive: selectedIds.size > 0,
    selectableIds,
    bulkIds,
    clearSelection,
    handleToggleSelect,
    handleSelectAll,
    ...keywordGroups,
  };
}
