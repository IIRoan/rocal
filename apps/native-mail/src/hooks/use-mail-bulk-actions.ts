import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { getErrorMessage } from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import type { useMailMutations } from "../lib/mail/use-mail";
import {
  deleteForeverPrompt,
  messageCountLabel,
} from "../lib/mail/mail-action-messages";
import type { JmapMailbox, LabelDef } from "../lib/mail/types";
import type { useMailUndoToast } from "./use-mail-undo-toast";

interface MailBulkActionsParams {
  mutations: ReturnType<typeof useMailMutations>;
  mailboxes: JmapMailbox[];
  labels: LabelDef[];
  isInTrash: boolean;
  bulkIds: string[];
  unreadSelectedIds: string[];
  readSelectedIds: string[];
  unflaggedSelectedIds: string[];
  flaggedSelectedIds: string[];
  clearSelection: () => void;
  closeSheet: () => void;
  showMoveToast: ReturnType<typeof useMailUndoToast>;
}

export function useMailBulkActions({
  mutations,
  mailboxes,
  labels,
  isInTrash,
  bulkIds,
  unreadSelectedIds,
  readSelectedIds,
  unflaggedSelectedIds,
  flaggedSelectedIds,
  clearSelection,
  closeSheet,
  showMoveToast,
}: MailBulkActionsParams) {
  const {
    toggleFlagged,
    setMessageLabel,
    bulkMarkAsRead,
    bulkMarkAsUnread,
    bulkMoveToTrash,
    bulkMoveToMailbox,
    bulkDestroyMessages,
  } = mutations;
  const { toast } = useToast();
  const [bulkActionPending, setBulkActionPending] = useState(false);

  const isActionBusy = [
    bulkActionPending,
    bulkMarkAsRead.isPending,
    bulkMarkAsUnread.isPending,
    bulkMoveToTrash.isPending,
    bulkMoveToMailbox.isPending,
    bulkDestroyMessages.isPending,
    toggleFlagged.isPending,
    setMessageLabel.isPending,
  ].some(Boolean);

  const handleBulkMarkRead = useCallback(() => {
    if (unreadSelectedIds.length === 0) return;
    bulkMarkAsRead.mutate(unreadSelectedIds, {
      onSuccess: () => {
        clearSelection();
        closeSheet();
        toast(`Marked ${unreadSelectedIds.length} as read`);
      },
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to mark messages as read."),
          "error",
        ),
    });
  }, [unreadSelectedIds, bulkMarkAsRead, clearSelection, closeSheet, toast]);

  const handleBulkMarkUnread = useCallback(() => {
    if (readSelectedIds.length === 0) return;
    bulkMarkAsUnread.mutate(readSelectedIds, {
      onSuccess: () => {
        clearSelection();
        closeSheet();
        toast(`Marked ${readSelectedIds.length} as unread`);
      },
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to mark messages as unread."),
          "error",
        ),
    });
  }, [readSelectedIds, bulkMarkAsUnread, clearSelection, closeSheet, toast]);

  const handleBulkDeleteForever = useCallback(() => {
    if (bulkIds.length === 0) return;
    closeSheet();
    const ids = bulkIds;
    Alert.alert("Delete forever?", deleteForeverPrompt(ids.length), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          bulkDestroyMessages.mutate(ids, {
            onSuccess: () => {
              clearSelection();
              toast(`Permanently deleted ${messageCountLabel(ids.length)}`);
            },
            onError: (error) =>
              toast(
                getErrorMessage(error, "Failed to delete messages."),
                "error",
              ),
          }),
      },
    ]);
  }, [bulkDestroyMessages, bulkIds, clearSelection, closeSheet, toast]);

  const handleBulkTrash = useCallback(() => {
    if (bulkIds.length === 0) return;
    if (isInTrash) {
      handleBulkDeleteForever();
      return;
    }
    closeSheet();
    const count = bulkIds.length;
    bulkMoveToTrash.mutate(bulkIds, {
      onSuccess: (_data, _ids, snapshot) => {
        clearSelection();
        showMoveToast(`Moved ${count} to trash`, snapshot);
      },
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to move messages to trash."),
          "error",
        ),
    });
  }, [
    bulkIds,
    bulkMoveToTrash,
    clearSelection,
    closeSheet,
    handleBulkDeleteForever,
    isInTrash,
    showMoveToast,
    toast,
  ]);

  const handleBulkMove = useCallback(
    (targetMailboxId: string) => {
      if (bulkIds.length === 0) return;
      const targetName =
        mailboxes.find((m) => m.id === targetMailboxId)?.name ?? "mailbox";
      bulkMoveToMailbox.mutate(
        { messageIds: bulkIds, targetMailboxId },
        {
          onSuccess: (_data, _input, snapshot) => {
            clearSelection();
            closeSheet();
            showMoveToast(`Moved ${bulkIds.length} to ${targetName}`, snapshot);
          },
          onError: (error) =>
            toast(getErrorMessage(error, "Failed to move messages."), "error"),
        },
      );
    },
    [
      bulkIds,
      bulkMoveToMailbox,
      clearSelection,
      closeSheet,
      mailboxes,
      showMoveToast,
      toast,
    ],
  );

  const runBulkFlagUpdate = useCallback(
    async (
      ids: string[],
      flagged: boolean,
      successMessage: string,
      errorMessage: string,
    ) => {
      setBulkActionPending(true);
      closeSheet();
      try {
        await Promise.all(
          ids.map((id) =>
            toggleFlagged.mutateAsync({ messageId: id, flagged }),
          ),
        );
        toast(successMessage);
        clearSelection();
      } catch (error) {
        toast(getErrorMessage(error, errorMessage), "error");
      } finally {
        setBulkActionPending(false);
      }
    },
    [clearSelection, closeSheet, toggleFlagged, toast],
  );

  const handleBulkStar = useCallback(() => {
    if (unflaggedSelectedIds.length === 0) return;
    return runBulkFlagUpdate(
      unflaggedSelectedIds,
      true,
      `Starred ${messageCountLabel(unflaggedSelectedIds.length)}`,
      "Failed to star messages.",
    );
  }, [runBulkFlagUpdate, unflaggedSelectedIds]);

  const handleBulkUnstar = useCallback(() => {
    if (flaggedSelectedIds.length === 0) return;
    return runBulkFlagUpdate(
      flaggedSelectedIds,
      false,
      `Unstarred ${messageCountLabel(flaggedSelectedIds.length)}`,
      "Failed to unstar messages.",
    );
  }, [flaggedSelectedIds, runBulkFlagUpdate]);

  const handleBulkApplyLabel = useCallback(
    async (labelId: string) => {
      if (bulkIds.length === 0) return;
      const label = labels.find((l) => l.id === labelId);
      setBulkActionPending(true);
      closeSheet();
      try {
        await Promise.all(
          bulkIds.map((id) =>
            setMessageLabel.mutateAsync({
              messageId: id,
              labelId,
              assigned: true,
            }),
          ),
        );
        toast(
          `Applied "${label?.name ?? labelId}" to ${bulkIds.length} messages`,
        );
        clearSelection();
      } catch (error) {
        toast(getErrorMessage(error, "Failed to apply label."), "error");
      } finally {
        setBulkActionPending(false);
      }
    },
    [bulkIds, labels, setMessageLabel, clearSelection, closeSheet, toast],
  );

  return {
    isActionBusy,
    handleBulkMarkRead,
    handleBulkMarkUnread,
    handleBulkTrash,
    handleBulkDeleteForever,
    handleBulkStar,
    handleBulkUnstar,
    handleBulkApplyLabel,
    handleBulkMove,
  };
}
