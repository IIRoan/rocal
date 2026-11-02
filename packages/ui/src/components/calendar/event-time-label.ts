import {
  clockTimePattern,
  formatClockTimeRange,
  formatEventSpanLabel,
  formatInUserTimezone,
  isCancelledCalendarEvent,
  resolveTimezone,
  spansMultipleCalendarDays,
  type TimeFormat,
} from "@workspace/calendar-core";
import { format, getMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import type { CalendarEvent } from "./types";

/** Screen readers get the title, the date and full time, and the cancelled state that grid chips show only by position, truncation or strikethrough. */
export function formatEventAccessibleLabel(
  event: CalendarEvent,
  timeFormat: TimeFormat,
  timezone?: string,
): string {
  const zone = resolveTimezone(timezone);
  const start = new Date(event.start);
  const end = new Date(event.end);
  const dateTimePattern = `MMM d, ${clockTimePattern(timeFormat)}`;
  let when = `${formatInUserTimezone(start, zone, "EEEE, MMMM d")}, ${formatClockTimeRange(start, end, zone, timeFormat)}`;
  if (event.allDay) {
    when = `All day, ${formatEventSpanLabel(event, zone)}`;
  } else if (spansMultipleCalendarDays(start, end, zone)) {
    when = `${formatInUserTimezone(start, zone, dateTimePattern)} – ${formatInUserTimezone(end, zone, dateTimePattern)}`;
  }
  const parts = [event.title || "Untitled event", when];
  if (isCancelledCalendarEvent(event)) parts.push("cancelled");
  return parts.join(", ");
}

const formatTimeWithOptionalMinutes = (
  date: Date,
  timeFormat: TimeFormat,
) => {
  if (timeFormat === "24h") {
    return format(date, getMinutes(date) === 0 ? "H" : "H:mm");
  } else {
    return format(date, getMinutes(date) === 0 ? "ha" : "h:mma").toLowerCase();
  }
};

export const formatTimeWithOptionalMinutesTZ = (
  date: Date,
  timeFormat: TimeFormat,
  timezone?: string,
) => {
  if (!timezone) return formatTimeWithOptionalMinutes(date, timeFormat);

  const minutesInTimezone = Number.parseInt(
    formatInTimeZone(date, timezone, "m"),
    10,
  );
  const token =
    timeFormat === "24h"
      ? minutesInTimezone === 0
        ? "H"
        : "H:mm"
      : minutesInTimezone === 0
        ? "ha"
        : "h:mma";
  const str = formatInTimeZone(date, timezone, token);
  return timeFormat === "12h" ? str.toLowerCase() : str;
};
