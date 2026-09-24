import { formatInTimeZone } from "date-fns-tz";

export type TimeFormat = "12h" | "24h";

/** Mirrors the `UserSettings.timeFormat` column default so loading states match the server. */
export const DEFAULT_TIME_FORMAT: TimeFormat = "24h";

/** The only place a missing or unknown setting is mapped to a format; everything downstream takes a resolved `TimeFormat`. */
export function resolveTimeFormat(value?: string | null): TimeFormat {
  return value === "12h" || value === "24h" ? value : DEFAULT_TIME_FORMAT;
}

export function clockTimePattern(timeFormat: TimeFormat): string {
  return timeFormat === "24h" ? "HH:mm" : "h:mm a";
}

/** Uses date-fns patterns instead of Intl `hour12`, which Hermes ignores alongside `timeStyle`. */
export function formatClockTime(
  date: Date,
  timezone: string,
  timeFormat: TimeFormat,
): string {
  return formatInTimeZone(date, timezone, clockTimePattern(timeFormat));
}

export function formatDateTimeLabel(
  date: Date,
  timezone: string,
  timeFormat: TimeFormat,
): string {
  const day = date.toLocaleDateString(undefined, {
    dateStyle: "medium",
    timeZone: timezone,
  });
  return `${day}, ${formatClockTime(date, timezone, timeFormat)}`;
}

export function formatClockTimeRange(
  start: Date,
  end: Date,
  timezone: string,
  timeFormat: TimeFormat,
): string {
  return `${formatClockTime(start, timezone, timeFormat)} – ${formatClockTime(end, timezone, timeFormat)}`;
}
