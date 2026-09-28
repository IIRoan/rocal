import { useCallback, useMemo, useState } from "react";
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

export function useMailListSelection({
  mailboxMessages,
  searchMessages,
  conversationExtras,
  threadRows,
  primaryMessageIds,
}: MailListSelectionParams) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectableIds = useMemo(
    () =>
      threadRows.flatMap((row) =>
        row.messageIds.filter((id) => primaryMessageIds.has(id)),
      ),
    [threadRows, primaryMessageIds],
  );

  const messageById = useMemo(() => {
    const map = new Map<string, JmapEmailMessage>();
    for (const message of [...mailboxMessages, ...searchMessages]) {
      map.set(message.id, message);
    }
    for (const message of conversationExtras) {
      if (!map.has(message.id)) {
        map.set(message.id, message);
      }
    }
    return map;
  }, [mailboxMessages, searchMessages, conversationExtras]);

  const bulkIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleThreadSelection = useCallback((messageIds: string[]) => {
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
  }, []);

  const handleToggleSelect = useCallback(
    (message: JmapEmailMessage, rowSelectableIds: string[]) => {
      toggleThreadSelection(
        rowSelectableIds.length > 0 ? rowSelectableIds : [message.id],
      );
    },
    [toggleThreadSelection],
  );

  const handleSelectAll = useCallback(() => {
    const allSelected =
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  }, [selectableIds, selectedIds]);

  const keywordGroups = useMemo(
    () => ({
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
    }),
    [bulkIds, messageById],
  );

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
