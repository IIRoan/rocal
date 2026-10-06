import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { resolveTimezone, wallClockToUtc } from "@workspace/calendar-core";

/** Minimum long-press duration (ms) to activate drag */
export const LONG_PRESS_DURATION_MS = 400;

/** Snap interval in minutes for drop targets */
export const SNAP_INTERVAL_MINUTES = 15;

/** Vertical pixel height of one hour in unused drag helpers / tests */
export const HOUR_HEIGHT = 60;

/** Scale applied to the event block while dragging */
export const DRAG_SCALE = 1.05;

/** Opacity applied to the event block while dragging */
export const DRAG_OPACITY = 0.85;

/** Spring config for snap-back animation */
export const SPRING_CONFIG = { damping: 20, stiffness: 200 };

export interface DropTarget {
  /** The new date for the event */
  date: Date;
  /** The hour component of the new start time (0–23) */
  hour: number;
  /** The minute component of the new start time (0, 15, 30, 45) */
  minute: number;
}

export interface DragResult {
  /** The event that was dragged */
  event: DecoratedCalendarEvent;
  /** The new start time */
  newStart: Date;
  /** The new end time (preserving original duration) */
  newEnd: Date;
}

export function getEventDurationMs(start: Date, end: Date): number {
  return end.getTime() - start.getTime();
}

export function snapToInterval(rawMinutes: number): number {
  return Math.round(rawMinutes / SNAP_INTERVAL_MINUTES) * SNAP_INTERVAL_MINUTES;
}

export function yOffsetToTime(
  yOffset: number,
  hourHeight: number,
): { hour: number; minute: number } {
  const totalMinutes = Math.max(
    0,
    Math.min((yOffset / hourHeight) * 60, 24 * 60 - 1),
  );
  const snapped = snapToInterval(totalMinutes);
  const clampedMinutes = Math.min(snapped, 24 * 60 - SNAP_INTERVAL_MINUTES);
  return {
    hour: Math.floor(clampedMinutes / 60),
    minute: clampedMinutes % 60,
  };
}

export function xOffsetToColumnIndex(
  xOffset: number,
  columnWidth: number,
  columnCount: number,
): number {
  const index = Math.floor(xOffset / columnWidth);
  return Math.max(0, Math.min(index, columnCount - 1));
}

export function computeRescheduledTimes(
  event: DecoratedCalendarEvent,
  dropTarget: DropTarget,
  timezone?: string,
): { newStart: Date; newEnd: Date } {
  const originalStart = new Date(event.start);
  const originalEnd = new Date(event.end);
  const durationMs = getEventDurationMs(originalStart, originalEnd);

  const newStart = wallClockToUtc(
    dropTarget.date,
    dropTarget.hour,
    dropTarget.minute,
    resolveTimezone(timezone ?? event.timezone),
  );

  const newEnd = new Date(newStart.getTime() + durationMs);

  return { newStart, newEnd };
}

/** Returns 0 when the event's day is not among the visible columns, so drags stay in view. */
export function findEventColumnIndex(
  eventStart: Date,
  columnDates: Date[],
): number {
  const idx = columnDates.findIndex(
    (d) =>
      d.getFullYear() === eventStart.getFullYear() &&
      d.getMonth() === eventStart.getMonth() &&
      d.getDate() === eventStart.getDate(),
  );
  return idx >= 0 ? idx : 0;
}
