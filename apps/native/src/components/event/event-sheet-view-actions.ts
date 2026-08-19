import type { CalendarEvent } from "@workspace/calendar-core";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserEditEvent,
  canCurrentUserModifyEvent,
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
    showEdit: canCurrentUserModifyEvent(event),
    deleteLabel: !canEdit && cancelled ? "Remove" : "Delete",
  };
}
