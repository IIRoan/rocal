import { describe, expect, it } from "@jest/globals";
import { addDays, eachDayOfInterval, endOfDay, startOfDay } from "date-fns";

import type { CalendarEvent } from "../components/calendar/types";
import { buildMiniCalendarDayEventsMap } from "./use-mini-calendar-month-data";

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function createEvent(
  id: string,
  day: Date,
  calendarId: string,
  color?: string,
): CalendarEvent {
  return {
    id,
    title: id,
    start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0, 0),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0, 0),
    calendarId,
    color,
    userId: "user-1",
    createdAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0, 0),
    updatedAt: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0, 0),
  };
}

describe("buildMiniCalendarDayEventsMap", () => {
  const gridStart = new Date(2026, 0, 5);
  const gridEnd = addDays(gridStart, 6);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const calendarColorMap = new Map<string, string>([
    ["visible", "teal"],
    ["hidden", "rose"],
  ]);

  it("filters out hidden-calendar events and uses visible calendar fallback colors", () => {
    const targetDay = addDays(gridStart, 2);
    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [
        createEvent("visible-event", targetDay, "visible", "red"),
        createEvent("hidden-event", targetDay, "hidden", "pink"),
      ],
      calendarColorMap,
      visibleCalendarIds: new Set(["visible"]),
    });

    expect(dayEventsMap.get(toDayKey(targetDay))).toEqual([
      expect.objectContaining({
        id: "visible-event",
        calendarId: "visible",
        color: "teal",
      }),
    ]);
  });

  it("preserves hidden and visible events when no visibility filter is provided", () => {
    const targetDay = addDays(gridStart, 3);
    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [
        createEvent("visible-event", targetDay, "visible", "red"),
        createEvent("hidden-event", targetDay, "hidden", "pink"),
      ],
      calendarColorMap,
    });

    expect(dayEventsMap.get(toDayKey(targetDay))).toEqual([
      expect.objectContaining({ id: "visible-event", color: "teal" }),
      expect.objectContaining({ id: "hidden-event", color: "rose" }),
    ]);
  });

  it("caps day indicators at three visible events", () => {
    const targetDay = addDays(gridStart, 4);
    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [
        createEvent("event-1", targetDay, "visible", "teal"),
        createEvent("event-2", targetDay, "visible", "blue"),
        createEvent("event-3", targetDay, "visible", "amber"),
        createEvent("event-4", targetDay, "visible", "red"),
      ],
      calendarColorMap,
      visibleCalendarIds: new Set(["visible"]),
    });

    expect(dayEventsMap.get(toDayKey(targetDay))?.map((event) => event.id)).toEqual([
      "event-1",
      "event-2",
      "event-3",
    ]);
  });
});