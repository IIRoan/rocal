import { formatInUserTimezone } from "./timezone";
import type { Calendar, TrashedCalendarEvent } from "./types";

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
