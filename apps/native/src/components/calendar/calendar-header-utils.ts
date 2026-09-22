import { resolveTimezone } from "@workspace/calendar-core";

export interface CalendarHeaderTitle {
  month: string;
  year: string;
}

export function formatCalendarHeaderTitle(
  date: Date,
  timezone?: string | null,
  locale = "en-US",
): CalendarHeaderTitle {
  const parts = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: resolveTimezone(timezone),
  }).formatToParts(date);

  return {
    month: parts.find((part) => part.type === "month")?.value ?? "",
    year: parts.find((part) => part.type === "year")?.value ?? "",
  };
}
