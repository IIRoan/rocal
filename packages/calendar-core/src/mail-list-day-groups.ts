import { formatPickerDate } from "./event-date";
import {
  formatCalendarDayKey,
  formatCalendarWeekKey,
  formatInstantCalendarDayKey,
  parseCalendarDayKey,
} from "./timezone";

/** The day heading a message sits under in the mail list, counted in the account's time zone. */
export function mailListDayLabel(
  receivedAt: string | null | undefined,
  now: Date,
  timezone?: string | null,
  weekStartDay = 1,
): string {
  const instant = receivedAt ? new Date(receivedAt) : null;
  const todayKey = formatInstantCalendarDayKey(now, timezone);
  const today = parseCalendarDayKey(todayKey);
  if (!instant || Number.isNaN(instant.getTime()) || !today) return "Older";
  const dayKey = formatInstantCalendarDayKey(instant, timezone);
  const day = parseCalendarDayKey(dayKey);
  if (!day) return "Older";
  if (dayKey >= todayKey) return "Today";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey === formatCalendarDayKey(yesterday)) return "Yesterday";
  if (formatCalendarWeekKey(day, weekStartDay, timezone) === formatCalendarWeekKey(today, weekStartDay, timezone)) {
    return "Earlier this week";
  }
  if (dayKey.slice(0, 7) === todayKey.slice(0, 7)) return `Earlier in ${formatPickerDate(today, "MMMM")}`;
  return formatPickerDate(day, dayKey.slice(0, 4) === todayKey.slice(0, 4) ? "MMMM" : "MMMM yyyy");
}
