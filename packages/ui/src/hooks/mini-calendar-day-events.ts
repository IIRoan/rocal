import {
  groupEventsByCalendarDay,
  resolveTimezone,
} from "@workspace/calendar-core";

import type { CalendarEvent } from "../components/calendar/types";

function resolveMiniCalendarIndicatorColor(
  event: CalendarEvent,
  calendarColorMap: Map<string, string>,
) {
  return calendarColorMap.get(event.calendarId) || event.color || undefined;
}

export function toMiniCalendarDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface BuildMiniCalendarDayEventsMapOptions {
  days: Date[];
  gridStart: Date;
  gridEnd: Date;
  cachedEvents?: CalendarEvent[];
  calendarColorMap: Map<string, string>;
  visibleCalendarIds?: ReadonlySet<string>;
  timezone?: string | null;
}

export function buildMiniCalendarDayEventsMap({
  days,
  gridStart,
  gridEnd,
  cachedEvents,
  calendarColorMap,
  visibleCalendarIds,
  timezone,
}: BuildMiniCalendarDayEventsMapOptions) {
  const map = new Map<string, CalendarEvent[]>();
  for (const day of days) {
    map.set(toMiniCalendarDayKey(day), []);
  }

  if (!cachedEvents || cachedEvents.length === 0) {
    return map;
  }

  const visible = visibleCalendarIds
    ? cachedEvents.filter((event) => visibleCalendarIds.has(event.calendarId))
    : cachedEvents;
  const buckets = groupEventsByCalendarDay(
    visible,
    { firstDay: gridStart, lastDay: gridEnd },
    resolveTimezone(timezone),
  );
  const withColor = (event: CalendarEvent): CalendarEvent => {
    const color = resolveMiniCalendarIndicatorColor(event, calendarColorMap);
    return color !== event.color ? { ...event, color } : event;
  };

  for (const [key, bucket] of buckets) {
    if (map.has(key)) map.set(key, bucket.slice(0, 3).map(withColor));
  }

  return map;
}
