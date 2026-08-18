import { EndHour, StartHour } from "./constants";

export const WEEK_HOUR_VALUES = Array.from(
  { length: EndHour - StartHour + 1 },
  (_, offset) => StartHour + offset,
);

export function formatWeekHourLabel(
  hour: number,
  timeFormat: "12h" | "24h",
): string {
  if (timeFormat === "24h") {
    return `${String(hour).padStart(2, "0")}:00`;
  }

  const hour12 = hour % 12 || 12;
  return `${hour12} ${hour >= 12 ? "PM" : "AM"}`;
}
