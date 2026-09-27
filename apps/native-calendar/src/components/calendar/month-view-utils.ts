import {
  formatClockTime,
  getEventCalendarDayRange,
  isSamePickerDay,
  resolveTimezone,
  type DecoratedCalendarEvent,
  type TimeFormat,
} from "@workspace/calendar-core";

export const MONTH_DAY_NUMBER_HEIGHT = 26;
export const MONTH_CHIP_HEIGHT = 16;
export const MONTH_CHIP_GAP = 2;

/** Chip rows that fit under the day number for a measured cell height. */
export function getMonthChipCapacity(cellHeight: number): number {
  const available = cellHeight - MONTH_DAY_NUMBER_HEIGHT - MONTH_CHIP_GAP;
  if (available < MONTH_CHIP_HEIGHT) return 0;
  return Math.floor(
    (available + MONTH_CHIP_GAP) / (MONTH_CHIP_HEIGHT + MONTH_CHIP_GAP),
  );
}

/** Chips to render plus the "+N more" overflow; the last capacity slot holds the overflow label. */
export function getMonthDayChipLayout<T>(
  events: readonly T[],
  capacity: number,
): { visible: T[]; hiddenCount: number } {
  const cap = Math.max(0, Math.floor(capacity));
  if (events.length <= cap) {
    return { visible: [...events], hiddenCount: 0 };
  }
  const shown = Math.max(0, cap - 1);
  return { visible: events.slice(0, shown), hiddenCount: events.length - shown };
}

/** Leading time on a month chip: only the event's first day shows its wall-clock start. */
export function formatMonthChipTime(
  event: DecoratedCalendarEvent,
  cellDay: Date,
  timeFormat: TimeFormat,
  timezone?: string | null,
): string {
  if (event.allDay) return "";
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  const { firstDay } = getEventCalendarDayRange(event, resolvedTimezone);
  if (!isSamePickerDay(firstDay, cellDay)) {
    return "";
  }
  return formatClockTime(new Date(event.start), resolvedTimezone, timeFormat);
}
