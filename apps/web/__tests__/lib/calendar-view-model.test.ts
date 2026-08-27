import { describe, expect, it } from "@jest/globals";
import { differenceInCalendarDays } from "date-fns";

import {
  createCalendarMap,
  createVisibleCalendarIdSet,
  getDefaultCalendarDateRange,
  mergePreviewCalendarEvents,
  normalizePreviewEventCalendarId,
  parseWorkingDays,
  resolveCalendarLoadingState,
  transformCalendarEvents,
} from "../../lib/calendar-view-model";
import type {
  Calendar,
  CalendarEvent as AppCalendarEvent,
} from "../../lib/types/calendar";
import type { CalendarEvent as UiCalendarEvent } from "@workspace/ui/components/calendar";

function calendarFixture(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "calendar-1",
    name: "Work",
    color: "violet",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: false,
    isSyncOnly: false,
    userId: "user-1",
    createdAt: new Date("2026-04-24T10:00:00.000Z"),
    updatedAt: new Date("2026-04-24T10:00:00.000Z"),
    ...overrides,
  };
}

function eventFixture(
  overrides: Partial<AppCalendarEvent> = {},
): AppCalendarEvent {
  return {
    id: "event-1",
    title: "Planning",
    start: new Date("2026-04-24T10:00:00.000Z"),
    end: new Date("2026-04-24T11:00:00.000Z"),
    calendarId: "calendar-1",
    userId: "user-1",
    createdAt: new Date("2026-04-24T09:00:00.000Z"),
    updatedAt: new Date("2026-04-24T09:00:00.000Z"),
    description: null,
    location: null,
    categoryId: null,
    color: null,
    ...overrides,
  };
}

describe("calendar-view-model", () => {
  it("filters hidden calendars and decorates events with calendar colors", () => {
    const calendars = [
      calendarFixture({ id: "calendar-1", color: "violet" }),
      calendarFixture({ id: "calendar-2", color: "emerald" }),
    ];
    const events = [
      eventFixture({ id: "event-1", calendarId: "calendar-1" }),
      eventFixture({ id: "event-2", calendarId: "calendar-2", color: "red" }),
    ];
    const calendarMap = createCalendarMap(calendars);
    const visibleCalendarIds = createVisibleCalendarIdSet(
      calendars,
      (calendarId) => calendarId === "calendar-1",
    );

    const transformedEvents = transformCalendarEvents(
      events,
      calendarMap,
      visibleCalendarIds,
    );

    expect(transformedEvents).toEqual([
      expect.objectContaining({
        id: "event-1",
        color: "violet",
        description: undefined,
        location: undefined,
        categoryId: undefined,
      }),
    ]);
  });

  it("merges preview events and tags them as previews", () => {
    const calendarMap = createCalendarMap([
      calendarFixture({ id: "calendar-1", color: "violet" }),
    ]);
    const previewEvent = {
      ...eventFixture({ id: "", calendarId: "calendar-1" }),
      color: null,
    } as unknown as UiCalendarEvent;

    const mergedEvents = mergePreviewCalendarEvents({
      baseEvents: [],
      calendarMap,
      previewEvents: [previewEvent],
    });

    expect(mergedEvents).toEqual([
      expect.objectContaining({
        id: "__preview__",
        isPreview: true,
        color: "violet",
      }),
    ]);
  });

  it("normalizes preview calendar ids and safely parses working days", () => {
    expect(
      normalizePreviewEventCalendarId(
        eventFixture({ calendarId: "" }) as unknown as UiCalendarEvent,
        "calendar-1",
      ),
    ).toEqual(expect.objectContaining({ calendarId: "calendar-1" }));
    expect(parseWorkingDays("[1,2,4]")).toEqual([1, 2, 4]);
    expect(parseWorkingDays("{bad json")).toEqual([1, 2, 3, 4, 5]);
  });

  it("derives loading state and default ranges for calendar initialization", () => {
    const loadingState = resolveCalendarLoadingState({
      settingsLoading: false,
      calendarsLoading: false,
      calendarCount: 2,
      categoriesLoading: false,
      categoryCount: 1,
      eventsLoading: true,
      eventCount: 0,
    });
    const range = getDefaultCalendarDateRange({
      baseDate: new Date(2026, 3, 24, 12, 0, 0, 0),
      view: "3day",
      weekStartDay: 1,
    });

    expect(loadingState).toEqual(
      expect.objectContaining({
        isAllInitialLoading: true,
        overlayContext: "DATA_SYNC",
      }),
    );
    expect(differenceInCalendarDays(range.end, range.start)).toBe(2);
    expect(range.start.getHours()).toBe(0);
    expect(range.end.getHours()).toBe(23);
  });

  it("does not keep the workspace overlay after an empty events fetch has settled", () => {
    expect(
      resolveCalendarLoadingState({
        settingsLoading: false,
        calendarsLoading: false,
        calendarCount: 2,
        categoriesLoading: false,
        categoryCount: 1,
        eventsLoading: false,
        eventCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        isAllInitialLoading: false,
        overlayContext: undefined,
      }),
    );
  });
});
