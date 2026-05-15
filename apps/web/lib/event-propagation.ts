import type { SyntheticEvent } from "react";

type EventWithStopPropagation =
  | Pick<SyntheticEvent, "stopPropagation">
  | { stopPropagation: () => void };

export function stopEventPropagation(event: EventWithStopPropagation) {
  event.stopPropagation();
}

export function isTextEntryElement(target: EventTarget | null) {
  if (!target || typeof target !== "object") {
    return false;
  }

  const candidate = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
  };

  return (
    candidate.tagName === "INPUT" ||
    candidate.tagName === "TEXTAREA" ||
    candidate.tagName === "SELECT" ||
    candidate.isContentEditable === true
  );
}
