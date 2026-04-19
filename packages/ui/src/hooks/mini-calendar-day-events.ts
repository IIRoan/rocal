import { eachDayOfInterval } from "date-fns";

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
}

export function buildMiniCalendarDayEventsMap({
  days,
  gridStart,
  gridEnd,
  cachedEvents,
  calendarColorMap,
  visibleCalendarIds,
}: BuildMiniCalendarDayEventsMapOptions) {
  const map = new Map<string, CalendarEvent[]>();
  for (const day of days) {
    map.set(toMiniCalendarDayKey(day), []);
  }

  if (!cachedEvents || cachedEvents.length === 0) {
    return map;
  }

  for (const rawEvent of cachedEvents) {
    if (visibleCalendarIds && !visibleCalendarIds.has(rawEvent.calendarId)) {
      continue;
    }

    const rawStart = new Date(rawEvent.start);
    const rawEnd = new Date(rawEvent.end);
    if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) continue;

    const eventStart = rawStart < gridStart ? gridStart : rawStart;
    const eventEnd = rawEnd > gridEnd ? gridEnd : rawEnd;
    if (eventEnd < gridStart || eventStart > gridEnd) continue;

    const resolvedColor = resolveMiniCalendarIndicatorColor(
      rawEvent,
      calendarColorMap,
    );
    const event: CalendarEvent =
      resolvedColor !== rawEvent.color
        ? { ...rawEvent, color: resolvedColor }
        : rawEvent;

    const daysInEvent = eachDayOfInterval({
      start: eventStart,
      end: eventEnd,
    });

    for (const day of daysInEvent) {
      const key = toMiniCalendarDayKey(day);
      const existing = map.get(key);
      if (!existing || existing.length >= 3) continue;
      existing.push(event);
    }
  }

  return map;
}