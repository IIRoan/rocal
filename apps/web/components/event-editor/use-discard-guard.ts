import { useState } from "react";

type EventEditorLeave = "close" | "back" | "view";

/** Holds a close or back request for the discard confirmation while the form has unsaved changes. */
export function useDiscardGuard(
  confirms: boolean,
  leave: (action: EventEditorLeave) => void,
) {
  const [pending, setPending] = useState<EventEditorLeave | null>(null);

  function requestLeave(action: EventEditorLeave) {
    if (confirms) {
      setPending(action);
      return;
    }
    leave(action);
  }

  const cancel = () => setPending(null);

  return {
    requestLeave,
    cancel,
    dialog: {
      open: pending !== null,
      onOpenChange: cancel,
      onConfirm: () => {
        setPending(null);
        if (pending) {
          leave(pending);
        }
      },
    },
  };
}
