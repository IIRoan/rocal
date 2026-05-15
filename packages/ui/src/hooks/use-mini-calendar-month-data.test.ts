import { describe, expect, it } from "@jest/globals";
import { addDays, eachDayOfInterval, endOfDay, startOfDay } from "date-fns";

import type { CalendarEvent } from "../components/calendar/types";
import {
  buildMiniCalendarDayEventsMap,
  toMiniCalendarDayKey,
} from "./mini-calendar-day-events";

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
    createdAt: new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      8,
      0,
      0,
    ),
    updatedAt: new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      8,
      0,
      0,
    ),
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

    expect(dayEventsMap.get(toMiniCalendarDayKey(targetDay))).toEqual([
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

    expect(dayEventsMap.get(toMiniCalendarDayKey(targetDay))).toEqual([
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

    expect(
      dayEventsMap
        .get(toMiniCalendarDayKey(targetDay))
        ?.map((event) => event.id),
    ).toEqual(["event-1", "event-2", "event-3"]);
  });

  it("returns empty indicator lists for days without cached events", () => {
    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [],
      calendarColorMap,
      visibleCalendarIds: new Set(["visible"]),
    });

    expect(dayEventsMap.get(toMiniCalendarDayKey(gridStart))).toEqual([]);
  });

  it("falls back to the event color when the calendar has no mapped color", () => {
    const targetDay = addDays(gridStart, 1);
    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [createEvent("event-1", targetDay, "unmapped", "pink")],
      calendarColorMap,
    });

    expect(dayEventsMap.get(toMiniCalendarDayKey(targetDay))).toEqual([
      expect.objectContaining({ id: "event-1", color: "pink" }),
    ]);
  });

  it("keeps the indicator color undefined when neither the calendar nor event defines one", () => {
    const targetDay = addDays(gridStart, 1);
    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [createEvent("event-unstyled", targetDay, "unmapped")],
      calendarColorMap,
    });

    expect(dayEventsMap.get(toMiniCalendarDayKey(targetDay))).toEqual([
      expect.objectContaining({ id: "event-unstyled", color: undefined }),
    ]);
  });

  it("skips events with invalid dates", () => {
    const targetDay = addDays(gridStart, 1);
    const invalidEvent: CalendarEvent = {
      ...createEvent("invalid-event", targetDay, "visible", "teal"),
      start: new Date("invalid"),
    };

    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [invalidEvent],
      calendarColorMap,
      visibleCalendarIds: new Set(["visible"]),
    });

    expect(dayEventsMap.get(toMiniCalendarDayKey(targetDay))).toEqual([]);
  });

  it("skips events that fall completely outside the visible grid", () => {
    const outsideDay = addDays(gridEnd, 2);
    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [
        createEvent("outside-event", outsideDay, "visible", "teal"),
      ],
      calendarColorMap,
      visibleCalendarIds: new Set(["visible"]),
    });

    expect(dayEventsMap.get(toMiniCalendarDayKey(gridEnd))).toEqual([]);
  });

  it("clamps multi-day events to the visible grid range", () => {
    const spanningEvent: CalendarEvent = {
      id: "spanning",
      title: "spanning",
      start: addDays(gridStart, -2),
      end: addDays(gridEnd, 2),
      calendarId: "visible",
      userId: "user-1",
      createdAt: gridStart,
      updatedAt: gridStart,
    };

    const dayEventsMap = buildMiniCalendarDayEventsMap({
      days,
      gridStart: startOfDay(gridStart),
      gridEnd: endOfDay(gridEnd),
      cachedEvents: [spanningEvent],
      calendarColorMap,
      visibleCalendarIds: new Set(["visible"]),
    });

    expect(dayEventsMap.get(toMiniCalendarDayKey(gridStart))).toEqual([
      expect.objectContaining({ id: "spanning", color: "teal" }),
    ]);
    expect(dayEventsMap.get(toMiniCalendarDayKey(gridEnd))).toEqual([
      expect.objectContaining({ id: "spanning", color: "teal" }),
    ]);
  });
});
