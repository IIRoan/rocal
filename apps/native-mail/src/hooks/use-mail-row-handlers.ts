import { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { getErrorMessage } from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { isDraftMessage } from "../lib/mail/mail-helpers";
import { mailMessageRoute } from "../lib/mail-routes";
import type { useMailMutations } from "../lib/mail/use-mail";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapEmailMessage } from "../lib/mail/types";
import type { MailThreadRowHandlers } from "../components/mail/MailThreadListRow";
import { useMailCompose } from "../providers/MailComposeProvider";
import type { useMailUndoToast } from "./use-mail-undo-toast";

interface MailRowHandlersParams {
  mutations: ReturnType<typeof useMailMutations>;
  runtime: MailRuntime | undefined;
  mailboxId: string | null;
  isInTrash: boolean;
  onToggleSelect: (message: JmapEmailMessage, selectableIds: string[]) => void;
  showMoveToast: ReturnType<typeof useMailUndoToast>;
}

export function useMailRowHandlers({
  mutations,
  runtime,
  mailboxId,
  isInTrash,
  onToggleSelect,
  showMoveToast,
}: MailRowHandlersParams): MailThreadRowHandlers {
  const router = useRouter();
  const { openCompose } = useMailCompose();
  const { toast } = useToast();

  // `mutate` is stable while the mutation result object is not; rows stay memoized across swipes.
  const markReadMutate = mutations.bulkMarkAsRead.mutate;
  const markUnreadMutate = mutations.bulkMarkAsUnread.mutate;
  const moveToTrashMutate = mutations.bulkMoveToTrash.mutate;

  const handleOpenMessage = useCallback(
    (message: JmapEmailMessage) => {
      const mailboxes = runtime?.mailboxes ?? [];
      if (isDraftMessage(message, mailboxId, mailboxes)) {
        openCompose({ mode: "draft", messageId: message.id });
        return;
      }
      router.push(mailMessageRoute(message.id) as never);
    },
    [openCompose, router, runtime?.mailboxes, mailboxId],
  );

  const handleSwipeToggleRead = useCallback(
    (ids: string[], read: boolean) => {
      if (ids.length === 0) return;
      const mutate = read ? markUnreadMutate : markReadMutate;
      mutate(ids, {
        onError: (error) =>
          toast(getErrorMessage(error, "Failed to update message."), "error"),
      });
    },
    [markReadMutate, markUnreadMutate, toast],
  );

  const handleSwipeTrash = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      return new Promise<void>((resolve) => {
        moveToTrashMutate(ids, {
          onSuccess: (_data, _ids, snapshot) =>
            showMoveToast("Moved to trash", snapshot),
          onError: (error) =>
            toast(
              getErrorMessage(error, "Failed to move message to trash."),
              "error",
            ),
          onSettled: () => resolve(),
        });
      });
    },
    [moveToTrashMutate, showMoveToast, toast],
  );

  return useMemo(
    () => ({
      onOpen: handleOpenMessage,
      onToggleSelect,
      onToggleRead: handleSwipeToggleRead,
      onTrash: isInTrash ? undefined : handleSwipeTrash,
    }),
    [
      handleOpenMessage,
      onToggleSelect,
      handleSwipeToggleRead,
      handleSwipeTrash,
      isInTrash,
    ],
  );
}
