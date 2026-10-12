import { useCallback, useRef } from "react";

/** Dismisses a sheet and runs the action once it has unmounted. */
export function useDeferredSheetAction(onDismiss: () => void) {
  const pendingRef = useRef<(() => void) | null>(null);

  const runAfterClose = useCallback(
    (action: () => void) => {
      pendingRef.current = action;
      onDismiss();
    },
    [onDismiss],
  );

  const onCloseComplete = useCallback(() => {
    const action = pendingRef.current;
    pendingRef.current = null;
    action?.();
  }, []);

  return { runAfterClose, onCloseComplete };
}
