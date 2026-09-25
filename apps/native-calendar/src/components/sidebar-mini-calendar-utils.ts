import type { Calendar, DecoratedCalendarEvent } from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";

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

/** Slow releases snap to the nearest page; flicks project velocity and advance at least one page, always settling inside the rendered window. */
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

  // Cap the distance from release at the window radius so a flick never commits a month the re-centered window would not cover (reads as flicker).
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
  calendars: readonly Calendar[] = [],
): DecoratedCalendarEvent[] {
  if (!data) return [];

  // The calendars query is refreshed on recolor; the list embedded in a cached events response is not.
  const calendarColorById = new Map(
    [...data.calendars, ...calendars].map((calendar) => [calendar.id, calendar.color]),
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
  calendars?: readonly Calendar[],
): DecoratedCalendarEvent[] {
  if (data) {
    const decorated = decorateMiniCalendarEvents(data, calendars);
    cache.set(monthKey, decorated);
    return decorated;
  }

  return cache.get(monthKey) ?? [];
}
