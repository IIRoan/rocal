import { describe, expect, it } from "@jest/globals";

import {
  buildStalwartEventPayload,
  mapStalwartEventToSolace,
} from "../../lib/stalwart-calendar-mapping";

describe("stalwart-calendar-mapping", () => {
  it("maps Solace events into JSCalendar payloads", () => {
    expect(
      buildStalwartEventPayload({
        calendarId: "cal-1",
        uid: "event-1@solace-calendar.local",
        title: "Planning",
        description: "Quarterly planning",
        start: new Date("2026-05-26T10:00:00.000Z"),
        end: new Date("2026-05-26T11:30:00.000Z"),
        allDay: false,
        timezone: "UTC",
        location: "Room A",
        reminder: 15,
        recurrence:
          '{"frequency":"weekly","interval":2,"count":4,"byWeekDay":[1,3],"timezone":"UTC"}',
        participants: [
          {
            email: "owner@example.com",
            displayName: "Owner",
            role: "organizer",
            status: "accepted",
          },
          {
            email: "guest@example.com",
            role: "attendee",
            status: "pending",
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        "@type": "Event",
        calendarIds: { "cal-1": true },
        uid: "event-1@solace-calendar.local",
        title: "Planning",
        description: "Quarterly planning",
        start: "2026-05-26T10:00:00",
        duration: "PT1H30M",
        timeZone: "Etc/UTC",
        locations: {
          primary: {
            "@type": "Location",
            name: "Room A",
          },
        },
        alerts: {
          default: {
            "@type": "Alert",
            action: "display",
            trigger: {
              "@type": "OffsetTrigger",
              relativeTo: "start",
              offset: "-PT15M",
            },
          },
        },
        recurrenceRule: {
          frequency: "weekly",
          interval: 2,
          count: 4,
          byDay: [{ day: "mo" }, { day: "we" }],
        },
      }),
    );
  });

  it("serializes all-day events using date-only JSCalendar starts", () => {
    expect(
      buildStalwartEventPayload({
        calendarId: "cal-1",
        uid: "allday-1@solace-calendar.local",
        title: "Offsite",
        start: new Date("2026-05-29T00:00:00.000Z"),
        end: new Date("2026-05-30T00:00:00.000Z"),
        allDay: true,
        timezone: "UTC",
      }),
    ).toEqual(
      expect.objectContaining({
        start: "2026-05-29",
        duration: "P1D",
      }),
    );
  });

  it("maps JSCalendar records back to Solace event fields", () => {
    const mapped = mapStalwartEventToSolace({
      id: "remote-event-1",
      uid: "uid-1",
      calendarIds: { "remote-cal-1": true },
      title: "Planning",
      description: "Quarterly planning",
      start: "2026-05-26T10:00:00",
      duration: "PT1H",
      timeZone: "Etc/UTC",
      locations: {
        primary: {
          name: "Room A",
        },
      },
      alerts: {
        default: {
          trigger: {
            offset: "-PT30M",
          },
        },
      },
      recurrenceRule: {
        frequency: "daily",
        count: 2,
      },
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        stalwartEventId: "remote-event-1",
        stalwartUid: "uid-1",
        stalwartCalendarId: "remote-cal-1",
        title: "Planning",
        description: "Quarterly planning",
        start: new Date("2026-05-26T10:00:00.000Z"),
        end: new Date("2026-05-26T11:00:00.000Z"),
        timezone: "UTC",
        location: "Room A",
        reminder: 30,
      }),
    );
    expect(mapped.allDay).toBe(false);
    expect(mapped.recurrence).toBe(
      '{"frequency":"daily","interval":1,"timezone":"UTC","count":2}',
    );
  });

  it("keeps day-based JSCalendar durations as all-day events only", () => {
    const mapped = mapStalwartEventToSolace({
      id: "remote-event-2",
      uid: "uid-2",
      calendarIds: { "remote-cal-1": true },
      title: "Holiday",
      start: "2026-05-29",
      duration: "P1D",
      timeZone: "Etc/UTC",
    });

    expect(mapped.allDay).toBe(true);
    expect(mapped.start).toEqual(new Date("2026-05-29T00:00:00.000Z"));
  });
});
