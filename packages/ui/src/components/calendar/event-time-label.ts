import type { TimeFormat } from "@workspace/calendar-core";
import { format, getMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

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
