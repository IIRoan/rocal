import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { toast } from "sonner";

import {
  buildDraggedEventUpdate,
  persistDraggedCalendarEvent,
} from "./event-calendar-mutations";
import type { CalendarEvent } from "./types";

const baseEvent = {
  id: "event-1",
  title: "Standup",
  calendarId: "cal-1",
  userId: "user-1",
  allDay: false,
  start: new Date("2026-06-01T09:00:00.000Z"),
  end: new Date("2026-06-01T10:00:00.000Z"),
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
} as CalendarEvent;

const movedTimes = {
  start: new Date("2026-06-02T11:00:00.000Z"),
  end: new Date("2026-06-02T12:00:00.000Z"),
};

describe("buildDraggedEventUpdate", () => {
  it("sends only timing fields so no plaintext content leaves the device", () => {
    const body = buildDraggedEventUpdate(
      {
        start: new Date("2026-06-01T09:00:00.000Z"),
        end: new Date("2026-06-01T10:00:00.000Z"),
        allDay: false,
      },
      "Europe/Amsterdam",
    );

    expect(body).toEqual({
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T10:00:00.000Z",
      allDay: false,
      timezone: "Europe/Amsterdam",
    });
  });
});

describe("persistDraggedCalendarEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("updates single events directly", async () => {
    const updateEvent = jest.fn(async () => undefined);
    const moveRecurringEvent = jest.fn(async () => true);

    await persistDraggedCalendarEvent({
      timezone: "UTC",
      timeFormat: "24h",
      updateEvent,
      moveRecurringEvent,
      originalEvent: baseEvent,
      updatedEvent: { ...baseEvent, ...movedTimes },
    });

    expect(updateEvent).toHaveBeenCalledWith("event-1", {
      start: "2026-06-02T11:00:00.000Z",
      end: "2026-06-02T12:00:00.000Z",
      allDay: false,
      timezone: "UTC",
    });
    expect(moveRecurringEvent).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("routes recurring occurrences through the scope prompt with the pre-drag event", async () => {
    const updateEvent = jest.fn(async () => undefined);
    const moveRecurringEvent = jest.fn(async () => true);
    const occurrence = {
      ...baseEvent,
      id: "series-1_2026-06-01T09:00:00.000Z",
      parentEventId: "series-1",
      isRecurringInstance: true,
    } as CalendarEvent;

    await persistDraggedCalendarEvent({
      timezone: "UTC",
      timeFormat: "24h",
      updateEvent,
      moveRecurringEvent,
      originalEvent: occurrence,
      updatedEvent: { ...occurrence, ...movedTimes },
    });

    expect(updateEvent).not.toHaveBeenCalled();
    expect(moveRecurringEvent).toHaveBeenCalledWith(occurrence, {
      start: "2026-06-02T11:00:00.000Z",
      end: "2026-06-02T12:00:00.000Z",
      allDay: false,
      timezone: "UTC",
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("discards the drop silently when the scope prompt is cancelled", async () => {
    const updateEvent = jest.fn(async () => undefined);
    const moveRecurringEvent = jest.fn(async () => false);
    const series = {
      ...baseEvent,
      id: "series-1",
      recurrence: "FREQ=DAILY",
    } as CalendarEvent;

    await persistDraggedCalendarEvent({
      timezone: "UTC",
      timeFormat: "24h",
      updateEvent,
      moveRecurringEvent,
      originalEvent: series,
      updatedEvent: { ...series, ...movedTimes },
    });

    expect(updateEvent).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
