import type { CalendarEvent } from "@workspace/calendar-core";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserEditEvent,
  isCancelledCalendarEvent,
} from "@workspace/calendar-core";

export type EventSheetViewActions = {
  showDelete: boolean;
  showEdit: boolean;
  deleteLabel: "Delete" | "Remove";
};

export function resolveEventSheetViewActions(
  event: CalendarEvent | null | undefined,
): EventSheetViewActions {
  if (!event?.id) {
    return { showDelete: false, showEdit: false, deleteLabel: "Delete" };
  }

  const canEdit = canCurrentUserEditEvent(event);
  const cancelled = isCancelledCalendarEvent(event);

  return {
    showDelete: canCurrentUserDeleteEvent(event),
    showEdit: canEdit && event.isSynced !== true && !cancelled,
    deleteLabel: !canEdit && cancelled ? "Remove" : "Delete",
  };
}
