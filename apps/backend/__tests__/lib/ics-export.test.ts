import { describe, expect, it } from "@jest/globals";
import type { CalendarEvent } from "../../generated/prisma/index.js";
import { toIcsBuildEvent, toSafeIcsFilename } from "../../lib/ics-export";

function createCalendarEvent(
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: "event-1",
    title: "Planning",
    description: "Quarterly review",
    start: new Date("2024-02-01T10:00:00.000Z"),
    end: new Date("2024-02-01T11:00:00.000Z"),
    allDay: false,
    location: "Room A",
    color: null,
    timezone: "UTC",
    isPrivate: false,
    reminder: null,
    recurrence: null,
    parentEventId: null,
    isSynced: false,
    externalId: null,
    subscriptionId: null,
    syncedAt: null,
    userId: "user-1",
    calendarId: "calendar-1",
    categoryId: null,
    createdAt: new Date("2024-01-01T08:00:00.000Z"),
    updatedAt: new Date("2024-01-02T09:00:00.000Z"),
    ...overrides,
  };
}

describe("ics-export", () => {
  it("maps a calendar event into an ICS build payload", () => {
    const event = createCalendarEvent({
      externalId: "external-123",
      recurrence:
        '{"frequency":"weekly","interval":2,"count":5,"until":"2024-03-01T00:00:00.000Z","timezone":"UTC","byWeekDay":[1,3],"byMonthDay":[1],"byMonth":[2]}',
    });

    expect(toIcsBuildEvent(event)).toEqual({
      uid: "external-123",
      title: "Planning",
      description: "Quarterly review",
      start: new Date("2024-02-01T10:00:00.000Z"),
      end: new Date("2024-02-01T11:00:00.000Z"),
      allDay: false,
      location: "Room A",
      recurrence: {
        frequency: "weekly",
        interval: 2,
        count: 5,
        until: "2024-03-01T00:00:00.000Z",
        timezone: "UTC",
        byWeekDay: [1, 3],
        byMonthDay: [1],
        byMonth: [2],
      },
      createdAt: new Date("2024-01-01T08:00:00.000Z"),
      updatedAt: new Date("2024-01-02T09:00:00.000Z"),
    });
  });

  it("falls back to a local UID when an external identifier is missing", () => {
    expect(toIcsBuildEvent(createCalendarEvent()).uid).toBe(
      "event-1@solace-calendar.local",
    );
  });

  it("drops invalid recurrence definitions", () => {
    expect(
      toIcsBuildEvent(
        createCalendarEvent({
          recurrence: '{"frequency":"weekly","interval":0}',
        }),
      ).recurrence,
    ).toBeUndefined();
  });

  it("normalizes unsafe filenames and preserves the .ics extension", () => {
    expect(toSafeIcsFilename("  Team Calendar  ")).toBe("team-calendar.ics");
    expect(toSafeIcsFilename("Roadmap: Q1/Q2")).toBe("roadmap-q1-q2.ics");
    expect(toSafeIcsFilename("already.ics")).toBe("already.ics");
  });

  it("falls back to calendar.ics when the name collapses to an empty value", () => {
    expect(toSafeIcsFilename("   ")).toBe("calendar.ics");
    expect(toSafeIcsFilename("!!!")).toBe("calendar.ics");
  });
});
