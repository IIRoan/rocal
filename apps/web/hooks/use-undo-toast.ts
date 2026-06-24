"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";

export type UndoableAction = {
  messageIds: string[];
  label: string;
  undo: () => Promise<void> | void;
};

const DEFAULT_UNDO_DURATION_MS = 5000;

export function useUndoToast(
  undoDurationMs: number = DEFAULT_UNDO_DURATION_MS,
) {
  const pendingUndoRef = useRef<UndoableAction | null>(null);

  const showUndoToast = useCallback(
    (action: UndoableAction) => {
      pendingUndoRef.current = action;

      const count = action.messageIds.length;
      const label =
        count > 1
          ? `${count} messages ${action.label}`
          : `Message ${action.label}`;

      toast(label, {
        duration: undoDurationMs,
        action: {
          label: "Undo",
          onClick: () => {
            const pending = pendingUndoRef.current;
            if (pending) {
              pendingUndoRef.current = null;
              void pending.undo();
            }
          },
        },
        onDismiss: () => {
          pendingUndoRef.current = null;
        },
      });
    },
    [undoDurationMs],
  );

  return { showUndoToast };
}
