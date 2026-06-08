import type { CalendarEvent } from "./types";

export const ENCRYPTED_EVENT_PLACEHOLDER_TITLE = "Encrypted event";

/** Matches the notification email template (`maxWidth: 555px`). */
export const EVENT_REMINDER_MAIL_MAX_WIDTH_PX = 555;

/** Approximate loaded body height at max width (logo → footer). */
export const EVENT_REMINDER_MAIL_CONTENT_HEIGHT_PX = 520;

export const EVENT_REMINDER_MAIL_CONTENT_ASPECT_RATIO =
  EVENT_REMINDER_MAIL_MAX_WIDTH_PX / EVENT_REMINDER_MAIL_CONTENT_HEIGHT_PX;

/** Minimum share of the mail body pane the reminder card should fill. */
export const EVENT_REMINDER_MAIL_MIN_FILL_RATIO = 0.65;

export type EventReminderMailView = {
  title: string;
  timeUntilEvent: string;
  eventDate: string;
  eventTime: string;
  duration: string;
  location?: string;
  description?: string;
  calendarName?: string;
  eventId: string;
};

type BuildEventReminderMailViewInput = {
  event: Pick<
    CalendarEvent,
    | "id"
    | "title"
    | "start"
    | "end"
    | "allDay"
    | "location"
    | "description"
    | "calendar"
  >;
  minutesBefore?: number | null;
  timezone?: string;
  timeFormat?: "12h" | "24h" | "system";
};

function formatReminderSummary(minutesBefore: number): string {
  if (minutesBefore <= 0) {
    return "starting now";
  }
  if (minutesBefore < 60) {
    return minutesBefore === 1 ? "1 minute" : `${minutesBefore} minutes`;
  }

  const hours = Math.floor(minutesBefore / 60);
  const remainingMinutes = minutesBefore % 60;
  if (remainingMinutes === 0) {
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

export function formatEventReminderLeadText(minutesBefore: number): string {
  if (minutesBefore <= 0) {
    return "Starting now";
  }

  return formatReminderSummary(minutesBefore);
}

function calculateEventDuration(
  start: Date,
  end: Date,
  allDay: boolean,
): string {
  if (allDay) {
    return "All day";
  }

  if (end <= start) {
    return "";
  }

  const durationMs = end.getTime() - start.getTime();
  const hours = Math.floor(durationMs / (60 * 60 * 1000));
  const minutes = Math.floor((durationMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }

  return "";
}

function formatInTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: timezone,
  }).format(date);
}

function formatEventClockTime(
  date: Date,
  options: { timezone: string; timeFormat?: "12h" | "24h" | "system" },
): string {
  const hour12 =
    options.timeFormat === "12h"
      ? true
      : options.timeFormat === "24h"
        ? false
        : undefined;

  return formatInTimezone(date, options.timezone, {
    hour: "numeric",
    minute: "2-digit",
    ...(hour12 === undefined ? {} : { hour12 }),
  });
}

export function buildEventReminderMailView(
  input: BuildEventReminderMailViewInput,
): EventReminderMailView {
  const timezone = input.timezone?.trim() || "UTC";
  const start = new Date(input.event.start);
  const end = new Date(input.event.end);
  const minutesBefore = input.minutesBefore ?? null;

  const eventDate = formatInTimezone(start, timezone, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  let eventTime = "All day";
  if (!input.event.allDay) {
    const startLabel = formatEventClockTime(start, {
      timezone,
      timeFormat: input.timeFormat,
    });
    const endLabel = formatEventClockTime(end, {
      timezone,
      timeFormat: input.timeFormat,
    });
    eventTime = end > start ? `${startLabel} - ${endLabel}` : startLabel;
  }

  return {
    title: input.event.title?.trim() || "Untitled event",
    timeUntilEvent:
      minutesBefore === null
        ? formatEventClockTime(start, { timezone, timeFormat: input.timeFormat })
        : formatEventReminderLeadText(minutesBefore),
    eventDate,
    eventTime,
    duration: calculateEventDuration(start, end, input.event.allDay === true),
    location: input.event.location?.trim() || undefined,
    description: input.event.description?.trim() || undefined,
    calendarName: input.event.calendar?.name?.trim() || undefined,
    eventId: input.event.id,
  };
}

export function isDecryptedEventReminderContent(
  event: Pick<CalendarEvent, "title">,
): boolean {
  const title = event.title?.trim();
  return Boolean(title && title !== ENCRYPTED_EVENT_PLACEHOLDER_TITLE);
}
