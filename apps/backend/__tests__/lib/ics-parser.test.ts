import { describe, expect, it } from "@jest/globals";

import type { CalendarEvent } from "../../generated/prisma/index.js";
import {
  areParsedEventParticipantsDifferent,
  convertParsedEventToCalendarEvent,
  isEventModified,
  parseICSFile,
} from "../../lib/ics-parser";

function createCalendarEvent(
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: "event-1",
    title: "Imported event",
    description: null,
    encryptedContent: null,
    blindIndexTokens: null,
    encryptionState: "plaintext",
    encryptionKeyVersion: 1,
    start: new Date("2024-02-01T10:00:00.000Z"),
    end: new Date("2024-02-01T11:00:00.000Z"),
    allDay: false,
    location: null,
    color: null,
    timezone: "UTC",
    isPrivate: false,
    reminder: null,
    recurrence: null,
    parentEventId: null,
    isCancelled: false,
    isSynced: false,
    externalId: null,
    subscriptionId: null,
    syncedAt: null,
    stalwartAccountId: null,
    stalwartCalendarId: null,
    stalwartEventId: null,
    stalwartUid: null,
    stalwartSyncedAt: null,
    userId: "user-1",
    calendarId: "calendar-1",
    categoryId: null,
    createdAt: new Date("2024-01-01T08:00:00.000Z"),
    updatedAt: new Date("2024-01-02T09:00:00.000Z"),
    ...overrides,
  };
}

describe("ics-parser", () => {
  it("parses ICS content through the shared package", () => {
    const result = parseICSFile(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:event-1",
        "DTSTART:20240201T100000Z",
        "DTEND:20240201T110000Z",
        "SUMMARY:Imported event",
        "DESCRIPTION:Imported description",
        "LOCATION:HQ",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      "UTC",
    );

    expect(result.errors).toEqual([]);
    expect(result.method).toBe("PUBLISH");
    expect(result.events).toEqual([
      expect.objectContaining({
        uid: "event-1",
        sourceUid: "event-1",
        title: "Imported event",
        description: "Imported description",
        location: "HQ",
        timezone: "Etc/UTC",
      }),
    ]);
  });

  it("strips Google invite boilerplate from imported descriptions", () => {
    const result = parseICSFile(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:event-2",
        "DTSTART:20240201T100000Z",
        "DTEND:20240201T110000Z",
        "SUMMARY:Imported event",
        "DESCRIPTION:Planning sync\\n-::~:~::~:~:~:~:~:~:~:~:~:~\\nJoin with Google Meet: https://meet.google.com/jvo-kwba-ijs\\nPlease do not edit this section.",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      "UTC",
    );

    // Separator lines and "Please do not edit" are stripped; Meet link is kept
    expect(result.events[0]?.description).toBe(
      "Planning sync\nJoin with Google Meet: https://meet.google.com/jvo-kwba-ijs",
    );
  });

  it("converts a parsed ICS event into a calendar create input", () => {
    const result = convertParsedEventToCalendarEvent(
      {
        uid: "uid-1",
        sourceUid: "uid-1",
        title: "Imported event",
        description: "Imported description",
        start: new Date("2024-02-01T10:00:00.000Z"),
        end: new Date("2024-02-01T11:00:00.000Z"),
        allDay: false,
        location: "HQ",
        recurrence: { frequency: "weekly", interval: 1, byWeekDay: [1, 3] },
        timezone: "Europe/Amsterdam",
      },
      "user-1",
      "calendar-1",
      "subscription-1",
    );

    expect(result).toEqual({
      title: "Imported event",
      description: "Imported description",
      start: new Date("2024-02-01T10:00:00.000Z"),
      end: new Date("2024-02-01T11:00:00.000Z"),
      allDay: false,
      location: "HQ",
      recurrence: '{"frequency":"weekly","interval":1,"byWeekDay":[1,3]}',
      timezone: "Europe/Amsterdam",
      isSynced: true,
      externalId: "uid-1",
      subscriptionId: "subscription-1",
      syncedAt: expect.any(Date),
      user: { connect: { id: "user-1" } },
      calendar: { connect: { id: "calendar-1" } },
    });
  });

  it("uses the default timezone and omits sync metadata when no subscription is provided", () => {
    expect(
      convertParsedEventToCalendarEvent(
        {
          uid: "uid-2",
          sourceUid: "uid-2",
          title: "Imported event",
          start: new Date("2024-02-01T10:00:00.000Z"),
          end: new Date("2024-02-01T11:00:00.000Z"),
          allDay: true,
        },
        "user-1",
        "calendar-1",
      ),
    ).toEqual({
      title: "Imported event",
      description: undefined,
      start: new Date("2024-02-01T10:00:00.000Z"),
      end: new Date("2024-02-01T11:00:00.000Z"),
      allDay: true,
      location: undefined,
      recurrence: undefined,
      timezone: "Europe/Amsterdam",
      isSynced: false,
      externalId: "uid-2",
      subscriptionId: undefined,
      syncedAt: undefined,
      user: { connect: { id: "user-1" } },
      calendar: { connect: { id: "calendar-1" } },
    });
  });

  it("detects when a parsed event matches the stored event", () => {
    const existingEvent = createCalendarEvent({
      title: "Imported event",
      description: "Imported description",
      location: "HQ",
      recurrence: '{"frequency":"weekly","interval":1}',
    });

    expect(
      isEventModified(existingEvent, {
        uid: "uid-1",
        sourceUid: "uid-1",
        title: "Imported event",
        description: "Imported description",
        start: new Date("2024-02-01T10:00:00.000Z"),
        end: new Date("2024-02-01T11:00:00.000Z"),
        allDay: false,
        location: "HQ",
        recurrence: { frequency: "weekly", interval: 1 },
        timezone: "UTC",
      }),
    ).toBe(false);
  });

  it("does not treat omitted parsed timezone as a modification", () => {
    const existingEvent = createCalendarEvent({
      timezone: "UTC",
    });

    expect(
      isEventModified(existingEvent, {
        uid: "uid-1",
        sourceUid: "uid-1",
        title: "Imported event",
        start: new Date("2024-02-01T10:00:00.000Z"),
        end: new Date("2024-02-01T11:00:00.000Z"),
        allDay: false,
      }),
    ).toBe(false);
  });

  it("detects modified data including fallback null and timezone handling", () => {
    const existingEvent = createCalendarEvent({
      description: null,
      location: null,
      recurrence: null,
      timezone: "UTC",
    });

    expect(
      isEventModified(existingEvent, {
        uid: "uid-1",
        sourceUid: "uid-1",
        title: "Imported event",
        description: "Changed",
        start: new Date("2024-02-01T10:00:00.000Z"),
        end: new Date("2024-02-01T11:00:00.000Z"),
        allDay: false,
        location: "HQ",
        recurrence: { frequency: "weekly", interval: 1 },
        timezone: "Europe/Amsterdam",
      }),
    ).toBe(true);
  });

  it("detects no participant change when normalized lists match regardless of order", () => {
    expect(
      areParsedEventParticipantsDifferent(
        [
          {
            email: "bob@example.com",
            displayName: null,
            role: "attendee",
            status: "pending",
          },
          {
            email: "alice@example.com",
            displayName: "Alice",
            role: "organizer",
            status: "accepted",
          },
        ],
        [
          { email: "alice@example.com", displayName: "Alice", role: "organizer" },
          { email: "bob@example.com", role: "attendee", status: "pending" },
        ],
      ),
    ).toBe(false);
  });

  it("detects a participant change when emails differ", () => {
    expect(
      areParsedEventParticipantsDifferent(
        [
          {
            email: "alice@example.com",
            displayName: null,
            role: "attendee",
            status: "pending",
          },
        ],
        [{ email: "bob@example.com", role: "attendee" }],
      ),
    ).toBe(true);
  });
});
