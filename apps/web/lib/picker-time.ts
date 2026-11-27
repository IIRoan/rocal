import { formatPickerDate } from "@workspace/calendar-core";

/** The shared time picker shows a Date; only its hours and minutes carry the "HH:mm" wall-clock time. */
export function wallClockToPickerTime(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hours || 0, minutes || 0, 0, 0);
}

export function pickerTimeToWallClock(date: Date): string {
  return formatPickerDate(date, "HH:mm");
}
