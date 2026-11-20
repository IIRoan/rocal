import type {
  CalendarEvent,
  InvitationResponseStatus,
} from "@workspace/calendar-core";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserEditEvent,
  canCurrentUserModifyEvent,
  getInvitationResponseStatus,
  isCancelledCalendarEvent,
  shouldShowInvitationActions,
} from "@workspace/calendar-core";

export type EventSheetViewActions = {
  showDelete: boolean;
  showEdit: boolean;
  deleteLabel: "Delete" | "Remove";
  showInvitationActions: boolean;
  invitationStatus: InvitationResponseStatus | null;
};

export function resolveEventSheetViewActions(
  event: CalendarEvent | null | undefined,
): EventSheetViewActions {
  if (!event?.id) {
    return {
      showDelete: false,
      showEdit: false,
      deleteLabel: "Delete",
      showInvitationActions: false,
      invitationStatus: null,
    };
  }

  const canEdit = canCurrentUserEditEvent(event);
  const cancelled = isCancelledCalendarEvent(event);

  return {
    showDelete: canCurrentUserDeleteEvent(event),
    // Content that did not open here would be saved back as its placeholder.
    showEdit: canCurrentUserModifyEvent(event) && !event.contentUnavailable,
    deleteLabel: !canEdit && cancelled ? "Remove" : "Delete",
    showInvitationActions: shouldShowInvitationActions(event),
    invitationStatus: getInvitationResponseStatus(event, canEdit),
  };
}
