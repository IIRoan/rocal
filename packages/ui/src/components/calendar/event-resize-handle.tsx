import type { PointerEvent as ReactPointerEvent } from "react";
import { canCurrentUserEditEvent } from "@workspace/calendar-core";

import { cn } from "../../lib/utils";
import type { CalendarEvent } from "./types";
import type { TimeGridResizeEdge } from "./use-time-grid-pointer-range";
import { isPreviewEvent } from "./utils";

/** Pointer-only grips on a timed event's edges; the editor's time fields and the C shortcut are the keyboard way. */
export function EventResizeHandles({
  event,
  onResizeStart,
}: {
  event: CalendarEvent;
  onResizeStart: (
    pointer: ReactPointerEvent<HTMLElement>,
    edge: TimeGridResizeEdge,
  ) => void;
}) {
  if (event.allDay || isPreviewEvent(event) || !canCurrentUserEditEvent(event)) {
    return null;
  }
  return (["start", "end"] as const).map((edge) => (
    // repo-rules-allow wcag-keyboard-access: aria-hidden pointer grip; resizing by keyboard happens in the editor's time fields
    <div
      key={edge}
      aria-hidden="true"
      data-resize-edge={edge}
      onPointerDown={(pointer) => onResizeStart(pointer, edge)}
      className={cn(
        "absolute inset-x-0 z-[1] h-1.5 cursor-ns-resize",
        edge === "start" ? "top-0" : "bottom-0",
      )}
    />
  ));
}
