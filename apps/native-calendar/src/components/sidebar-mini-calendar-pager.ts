/** Strip position is an absolute month coordinate; committing a swipe re-centers the window and never re-positions the strip, so a recycle cannot flash a wrong-month frame. */

/** Months rendered on each side of the committed month. */
export const MINI_CALENDAR_WINDOW_RADIUS = 2;

export interface MiniCalendarPagerWindow {
  /** Absolute index of the first rendered page. */
  start: number;
  /** Absolute index of the last rendered page. */
  end: number;
}

export function getMiniCalendarPagerWindow(
  committedIndex: number,
  radius: number,
): MiniCalendarPagerWindow {
  return { start: committedIndex - radius, end: committedIndex + radius };
}

/** Rubber-band clamp to the rendered window; worklet-safe, reads only its parameters. */
export function rubberBandPagerPosition(
  raw: number,
  minIndex: number,
  maxIndex: number,
  factor: number,
): number {
  "worklet";
  if (raw < minIndex) return minIndex + (raw - minIndex) * factor;
  if (raw > maxIndex) return maxIndex + (raw - maxIndex) * factor;
  return raw;
}
