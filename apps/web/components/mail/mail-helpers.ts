import {
  formatClockTime,
  formatInstantCalendarDayKey,
  formatPickerDate,
  parseCalendarDayKey,
  resolveTimezone,
  type TimeFormat,
} from "@workspace/calendar-core";
import type { MailAddress } from "@/lib/mail/types";

export function formatAddress(addresses: MailAddress[] | undefined): string {
  const first = addresses?.[0];
  if (!first) return "Unknown";
  return first.name?.trim() || first.email;
}

export function formatAddressFull(
  addresses: MailAddress[] | undefined,
  maxCount = 3,
): string {
  if (!addresses?.length) return "Unknown";
  const formatted = addresses.slice(0, maxCount).map((a) => {
    const name = a.name?.trim();
    return name ? `${name} <${a.email}>` : a.email;
  });
  const rest = addresses.length - maxCount;
  if (rest > 0) formatted.push(`+${rest} more`);
  return formatted.join(", ");
}

export function formatMessageDate(
  receivedAt: string | undefined,
  timeFormat: TimeFormat,
  timezone?: string,
): string {
  if (!receivedAt) return "";
  const date = new Date(receivedAt);
  if (Number.isNaN(date.getTime())) return "";
  const timeZone = resolveTimezone(timezone);
  const dayKey = formatInstantCalendarDayKey(date, timeZone);
  const todayKey = formatInstantCalendarDayKey(new Date(), timeZone);
  if (dayKey === todayKey) {
    return formatClockTime(date, timeZone, timeFormat);
  }
  // One fixed format, not the browser locale's, so every date in the list reads the same way ("29 Sep", "3 Mar 2025").
  const day = parseCalendarDayKey(dayKey);
  if (!day) return "";
  return formatPickerDate(day, dayKey.slice(0, 4) === todayKey.slice(0, 4) ? "d MMM" : "d MMM yyyy");
}
