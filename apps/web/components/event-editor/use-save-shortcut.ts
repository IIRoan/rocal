import { useEffect } from "react";

import { useEffectEvent } from "./use-effect-event";

/** Cmd/Ctrl+Enter saves while the editor is open in edit mode. */
export function useSaveShortcut(enabled: boolean, onSave: () => void) {
  const save = useEffectEvent(onSave);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        save();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
