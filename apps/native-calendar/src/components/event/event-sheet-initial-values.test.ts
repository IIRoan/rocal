import { describe, expect, it } from "@jest/globals";
import type { Calendar, CalendarEvent } from "@workspace/calendar-core";
import {
  eventDuplicateInitialValues,
  eventSheetInitialValues,
} from "./event-sheet-initial-values";

const TIMEZONE = "Europe/Amsterdam";

describe("eventSheetInitialValues", () => {
  it("seeds a swept range in the account time zone before date and hour", () => {
    expect(
      eventSheetInitialValues(
        {
          type: "create",
          date: "2026-11-20",
          hour: "8",
          start: "2026-11-14T13:00:00.000Z",
          end: "2026-11-14T14:45:00.000Z",
        },
        undefined,
        TIMEZONE,
      ),
    ).toEqual({
      start: "2026-11-14T14:00",
      end: "2026-11-14T15:45",
      timezone: TIMEZONE,
    });
  });

  it("keeps the one-hour slot on the tapped day and hour", () => {
    expect(
      eventSheetInitialValues(
        { type: "create", date: "2026-11-20", hour: "8" },
        undefined,
        TIMEZONE,
      ),
    ).toEqual({
      start: "2026-11-20T08:00",
      end: "2026-11-20T09:00",
      timezone: TIMEZONE,
    });
  });

  it("sizes the tapped slot to the account's default event duration", () => {
    expect(
      eventSheetInitialValues(
        { type: "create", date: "2026-11-20", hour: "8" },
        undefined,
        TIMEZONE,
        30,
      ),
    ).toEqual({
      start: "2026-11-20T08:00",
      end: "2026-11-20T08:30",
      timezone: TIMEZONE,
    });
  });

  it("leaves a plain create unseeded", () => {
    expect(eventSheetInitialValues({ type: "create" }, undefined, TIMEZONE)).toBeUndefined();
  });
});

describe("eventDuplicateInitialValues", () => {
  const calendar = (id: string, isSyncOnly: boolean): Calendar => ({
    id,
    name: id,
    color: "blue",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: false,
    isSyncOnly,
    userId: "u1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  const event: CalendarEvent = {
    id: "e1",
    title: "Standup",
    description: "Notes",
    location: "Room 4",
    start: new Date("2026-11-25T09:00:00Z"),
    end: new Date("2026-11-25T09:15:00Z"),
    allDay: false,
    color: "green",
    calendarId: "feed",
    categoryId: "c1",
    recurrence: '{"frequency":"weekly"}',
    userId: "u1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    participants: [
      { id: "p1", eventId: "e1", email: "a@x.test", role: "organizer", status: "accepted" },
    ],
  };

  it("seeds the create sheet with the copy in a writable calendar and no invitees", () => {
    const values = eventDuplicateInitialValues(
      event,
      [calendar("feed", true), calendar("work", false)],
      TIMEZONE,
    );
    expect(values).toMatchObject({
      title: "Standup",
      description: "Notes",
      location: "Room 4",
      start: "2026-11-25T10:00",
      end: "2026-11-25T10:15",
      color: "green",
      calendarId: "work",
      categoryId: "c1",
      recurrence: '{"frequency":"weekly"}',
      participants: [],
    });
    expect(
      eventSheetInitialValues(
        { type: "create", date: "2026-11-20", duplicate: { values: values ?? {}, reminders: [5] } },
        undefined,
        TIMEZONE,
      ),
    ).toBe(values);
  });

  it("offers nothing without a writable calendar", () => {
    expect(eventDuplicateInitialValues(event, [calendar("feed", true)], TIMEZONE)).toBeNull();
  });
});
