import { isMailInvitationStagingCalendar } from "./mail-invitation-staging";
import type { Calendar, CalendarEvent } from "./types";

type DuplicateTargetCalendar = Pick<Calendar, "id" | "name" | "isVisible" | "isSyncOnly" | "kind">;
type DuplicableEvent<Color> = Omit<CalendarEvent, "color"> & { color?: Color };

/** A new event can be saved here: not a read-only feed or the hidden invitation staging calendar. */
export function isWritableEventCalendar(calendar: DuplicateTargetCalendar): boolean {
  return !calendar.isSyncOnly && !isMailInvitationStagingCalendar(calendar);
}

/** The copy stays in the source's calendar when it is writable, else lands in the first writable one. */
export function resolveDuplicateCalendarId(
  event: Pick<CalendarEvent, "calendarId">,
  calendars: readonly DuplicateTargetCalendar[],
): string | null {
  const writable = calendars.filter(isWritableEventCalendar);
  return (writable.find((calendar) => calendar.id === event.calendarId) ?? writable[0])?.id ?? null;
}

/** Content that did not open here would be copied as its placeholder. */
export function canDuplicateEvent(
  event: Pick<CalendarEvent, "id" | "calendarId" | "contentUnavailable">,
  calendars: readonly DuplicateTargetCalendar[],
): boolean {
  return Boolean(event.id) && !event.contentUnavailable && resolveDuplicateCalendarId(event, calendars) !== null;
}

/** An unsaved copy for the create editor: same content, times, calendar, category, colour and repeat, but no invitees or invitation state. */
export function buildEventDuplicate<Color extends string | null>(
  event: DuplicableEvent<Color>,
  calendars: readonly DuplicateTargetCalendar[],
): DuplicableEvent<Color> | null {
  if (!canDuplicateEvent(event, calendars)) return null;
  const calendarId = resolveDuplicateCalendarId(event, calendars);
  if (!calendarId) return null;
  const now = new Date();
  return {
    id: "",
    title: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    start: new Date(event.start),
    end: new Date(event.end),
    timezone: event.timezone ?? null,
    allDay: event.allDay ?? false,
    color: event.color,
    calendarId,
    categoryId: event.categoryId ?? null,
    recurrence: event.recurrence ?? null,
    reminder: event.reminder ?? null,
    userId: event.userId,
    createdAt: now,
    updatedAt: now,
    participants: [],
  };
}
