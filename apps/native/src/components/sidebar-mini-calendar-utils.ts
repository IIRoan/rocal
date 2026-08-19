import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";

type MiniCalendarEventsResponse = Awaited<
  ReturnType<typeof calendarApiService.getEvents>
>;

export interface MiniCalendarSwipeTargetInput {
  /** Absolute page index the strip rested at when the gesture began (may be fractional after an interrupted settle). */
  startIndex: number;
  /** Absolute page index at release (fractional). */
  currentIndex: number;
  /** Horizontal finger travel in px (negative = toward next months). */
  translationX: number;
  /** Horizontal release velocity in px/s (negative = toward next months). */
  velocityX: number;
  /** Page width in px. */
  pageWidth: number;
  /** Absolute index of the first rendered page. */
  minIndex: number;
  /** Absolute index of the last rendered page. */
  maxIndex: number;
  /** Release speed (px/s) that counts as a flick. */
  commitVelocity: number;
  /** Seconds of flick momentum added to the predicted landing page. */
  momentumSeconds: number;
}

/**
 * Decides which page a mini-calendar swipe settles on.
 *
 * Slow releases snap to the nearest page. Flicks project the release
 * velocity forward and guarantee at least one page of progress in the flick
 * direction, so a swipe that interrupts a previous settle first finishes
 * that page and then keeps going. Always settles inside
 * `[minIndex, maxIndex]` — the rendered window — so the committed page is
 * mounted by the time the window re-centers.
 *
 * Worklet-safe: only reads its parameters.
 */
export function getMiniCalendarSwipeTarget(
  input: MiniCalendarSwipeTargetInput,
): number {
  "worklet";
  const {
    startIndex,
    currentIndex,
    translationX,
    velocityX,
    pageWidth,
    minIndex,
    maxIndex,
    commitVelocity,
    momentumSeconds,
  } = input;

  const movedPages = -translationX / pageWidth;
  const velocityPages = -velocityX / pageWidth;
  const predicted = startIndex + movedPages + velocityPages * momentumSeconds;

  let target: number;
  if (velocityX <= -commitVelocity) {
    target = Math.max(Math.round(predicted), Math.floor(currentIndex + 0.001) + 1);
  } else if (velocityX >= commitVelocity) {
    target = Math.min(Math.round(predicted), Math.ceil(currentIndex - 0.001) - 1);
  } else {
    target = Math.round(currentIndex);
  }

  // Never settle further from the release point than the window radius, so a
  // momentum flick cannot commit a month that the rendered window (centered on
  // the new month) would not cover — that gap is what reads as a flicker when
  // the next finger interrupts the settle.
  const radius = (maxIndex - minIndex) / 2;
  const nearReleaseMin = Math.ceil(currentIndex - radius);
  const nearReleaseMax = Math.floor(currentIndex + radius);
  if (target < nearReleaseMin) target = nearReleaseMin;
  if (target > nearReleaseMax) target = nearReleaseMax;

  if (target < minIndex) return minIndex;
  if (target > maxIndex) return maxIndex;
  return target;
}

export function decorateMiniCalendarEvents(
  data: MiniCalendarEventsResponse | undefined,
): DecoratedCalendarEvent[] {
  if (!data) return [];

  const calendarColorById = new Map(
    data.calendars.map((calendar) => [calendar.id, calendar.color]),
  );

  return data.events.map((event) => ({
    ...event,
    color: event.color ?? calendarColorById.get(event.calendarId) ?? undefined,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    categoryId: event.categoryId ?? undefined,
    reminder: event.reminder ?? undefined,
  }));
}

export function retainMonthEvents(
  cache: Map<string, DecoratedCalendarEvent[]>,
  monthKey: string,
  data: MiniCalendarEventsResponse | undefined,
): DecoratedCalendarEvent[] {
  if (data) {
    const decorated = decorateMiniCalendarEvents(data);
    cache.set(monthKey, decorated);
    return decorated;
  }

  return cache.get(monthKey) ?? [];
}
