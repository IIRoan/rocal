import { resolveRecurringEventTarget } from "./recurring-event-target";
import { formatInUserTimezone } from "./timezone";
import {
  isAttendeeImportedInvitationEvent,
  isCancelledCalendarEvent,
  type Calendar,
  type CalendarEvent,
  type RecurrenceDeleteScope,
  type TrashedCalendarEvent,
} from "./types";

export const EVENT_TRASH_EMPTY_MESSAGE = "Trash is empty. Deleted events stay here for 30 days.";

/** "Mon 2 Mar 2099 · Deleted 14 Nov · removed 14 Dec"; date-fns patterns only, since Hermes lacks Intl.RelativeTimeFormat. */
export function formatTrashEntryDetail(
  entry: Pick<TrashedCalendarEvent, "start" | "allDay" | "timezone" | "trashedAt" | "purgeAt">,
  timezone: string,
): string {
  const eventDate = formatInUserTimezone(
    entry.start,
    entry.allDay ? entry.timezone : timezone,
    "EEE d MMM yyyy",
  );
  const trashed = formatInUserTimezone(entry.trashedAt, timezone, "d MMM");
  const purged = formatInUserTimezone(entry.purgeAt, timezone, "d MMM");
  return `${eventDate} · Deleted ${trashed} · removed ${purged}`;
}

/** The toast after a restore; names the calendar it fell back to when its own was gone or read-only. */
export function getTrashRestoreNotice(
  restoredCalendarId: string,
  originalCalendarId: string,
  calendars: ReadonlyArray<Pick<Calendar, "id" | "name">> | undefined,
): string {
  if (restoredCalendarId === originalCalendarId) return "Event restored";
  const name = calendars?.find((calendar) => calendar.id === restoredCalendarId)?.name;
  return name ? `Restored to ${name}` : "Restored to your default calendar";
}

/** Mirrors the API: a whole event or series goes to the trash, except an attendee's invitation copy; one occurrence or the rest of a series is gone for good. */
export function getEventDeleteConfirmCopy(
  event: Pick<
    CalendarEvent,
    | "id"
    | "title"
    | "start"
    | "recurrence"
    | "parentEventId"
    | "isRecurringInstance"
    | "externalId"
    | "participants"
    | "userId"
    | "isCancelled"
  >,
  scope?: RecurrenceDeleteScope,
): { title: string; description: string; confirmLabel: string } {
  const title = event.title || "Untitled event";
  const target = scope ? resolveRecurringEventTarget(event) : null;
  const wholeEvent = !target || (scope === "this_only" && target.detachedEventId !== null);
  const invitation = isAttendeeImportedInvitationEvent(event);
  if (wholeEvent && invitation && isCancelledCalendarEvent(event)) {
    return {
      title: `Remove “${title}” from your calendar?`,
      description: "The cancelled event leaves your calendar. You can’t undo this.",
      confirmLabel: "Remove event",
    };
  }
  if (wholeEvent && invitation) {
    return {
      title: `Decline “${title}”?`,
      description: "The invitation is declined and leaves your calendar. You can’t undo this.",
      confirmLabel: "Decline and remove",
    };
  }
  const trashed = wholeEvent || (scope === "all" && !invitation);
  return {
    title: `Delete “${title}”?`,
    description: trashed ? "It moves to Trash for 30 days." : "You can’t undo this.",
    confirmLabel: "Delete event",
  };
}
