/**
 * Numeric pager model for the sidebar mini calendar.
 *
 * The strip position is an absolute month coordinate (page units), not an
 * offset into a recycled 3-page strip. Committing a swipe re-centers the
 * rendered month window around the new month; the strip itself is never
 * re-positioned, so a recycle cannot flash a wrong-month frame between the
 * React tree commit and any animated value update.
 */

/** Months rendered on each side of the committed month. */
export const MINI_CALENDAR_WINDOW_RADIUS = 2;

export interface MiniCalendarPagerWindow {
  /** Absolute index of the first rendered page. */
  start: number;
  /** Absolute index of the last rendered page. */
  end: number;
}

/**
 * Rendered page window for a committed absolute index. The committed page
 * always sits at the window's center.
 */
export function getMiniCalendarPagerWindow(
  committedIndex: number,
  radius: number,
): MiniCalendarPagerWindow {
  return { start: committedIndex - radius, end: committedIndex + radius };
}

/**
 * Clamps a dragged strip position to the rendered window with rubber-band
 * resistance past either edge. Worklet-safe: only reads its parameters.
 */
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
