import type { TimeFormat } from "@workspace/calendar-core";
import { format, getMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// Using date-fns format with custom formatting:
// 12h format: 'h' - hours (1-12), 'a' - am/pm
// 24h format: 'H' - hours (0-23)
// ':mm' - minutes with leading zero (only if the token 'mm' is present)
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

// Timezone-aware formatter (falls back to local if no timezone)
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
