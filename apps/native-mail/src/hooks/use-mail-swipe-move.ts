import { useState } from "react";
import { getErrorMessage } from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import type { useMailMutations } from "../lib/mail/use-mail";
import type { JmapMailbox } from "../lib/mail/types";
import type { useMailBulkActions } from "./use-mail-bulk-actions";
import type { useMailUndoToast } from "./use-mail-undo-toast";

/** The move sheet serves both bulk selection and a "Move to…" swipe, which carries its own row ids. */
export function useMailSwipeMove({
  mutations,
  mailboxes,
  bulk,
  bulkIds,
  activeSheetView,
  openSwipeMoveSheet,
  closeSheet,
  showMoveToast,
}: {
  mutations: ReturnType<typeof useMailMutations>;
  mailboxes: JmapMailbox[];
  bulk: ReturnType<typeof useMailBulkActions>;
  bulkIds: string[];
  activeSheetView: string | null;
  openSwipeMoveSheet: () => void;
  closeSheet: () => void;
  showMoveToast: ReturnType<typeof useMailUndoToast>;
}) {
  const { toast } = useToast();
  const [swipeMoveIds, setSwipeMoveIds] = useState<string[]>([]);
  const isSwipeMove = activeSheetView === "swipeMove";
  const { mutate: moveMutate } = mutations.bulkMoveToMailbox;

  const startSwipeMove = (ids: string[]) => {
    setSwipeMoveIds(ids);
    openSwipeMoveSheet();
  };

  const handleSwipeMove = (targetMailboxId: string) => {
    if (swipeMoveIds.length === 0) return;
    const targetName =
      mailboxes.find((m) => m.id === targetMailboxId)?.name ?? "mailbox";
    moveMutate(
      { messageIds: swipeMoveIds, targetMailboxId },
      {
        onSuccess: (_data, _input, snapshot) => {
          closeSheet();
          showMoveToast(`Moved to ${targetName}`, snapshot);
        },
        onError: (error) =>
          toast(getErrorMessage(error, "Failed to move messages."), "error"),
      },
    );
  };

  return {
    startSwipeMove,
    moveSheetOpen: isSwipeMove || activeSheetView === "bulkMove",
    moveSheetDisabled:
      bulk.isActionBusy || (isSwipeMove ? swipeMoveIds : bulkIds).length === 0,
    handleMoveSheetSelect: isSwipeMove ? handleSwipeMove : bulk.handleBulkMove,
  };
}
