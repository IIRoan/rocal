export interface CalendarHeaderTitle {
  month: string;
  year: string;
}

/** Reads device-local fields: the calendar date is a picker date, already shifted into the user's timezone. */
export function formatCalendarHeaderTitle(
  date: Date,
  locale = "en-US",
): CalendarHeaderTitle {
  const parts = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).formatToParts(date);

  return {
    month: parts.find((part) => part.type === "month")?.value ?? "",
    year: parts.find((part) => part.type === "year")?.value ?? "",
  };
}
