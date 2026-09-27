import { useCallback } from "react";
import { getErrorMessage } from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import {
  useUndoMailMove,
  type MailMoveSnapshot,
} from "../lib/mail/use-mail";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { useMailListSettings } from "./use-mail-list-settings";

/** Success toast for a finished move with an Undo action that restores the original mailboxes. */
export function useMailUndoToast(runtime: MailRuntime | undefined) {
  const { toast } = useToast();
  const { settings } = useMailListSettings();
  const { mutate: undoMove } = useUndoMailMove(runtime, {
    onSuccess: (snapshot) =>
      toast(
        snapshot.restores.length === 1
          ? "Message restored"
          : `Restored ${snapshot.restores.length} messages`,
      ),
    onError: (error) =>
      toast(getErrorMessage(error, "Could not undo the move."), "error"),
  });
  const duration = settings.undoToastDurationMs;

  return useCallback(
    (message: string, snapshot: MailMoveSnapshot | undefined) => {
      if (!snapshot || snapshot.restores.length === 0) {
        toast(message);
        return;
      }
      toast(message, "success", {
        duration,
        action: {
          label: "Undo",
          onPress: () => undoMove(snapshot),
        },
      });
    },
    [duration, toast, undoMove],
  );
}
