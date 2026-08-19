import { describe, expect, it } from "@jest/globals";
import {
  canCurrentUserDeleteEvent,
  canCurrentUserModifyEvent,
  type CalendarEvent,
} from "../types";

const userId = "user-1";

function attendeeInviteEvent(
  status: "pending" | "accepted" | "declined" | "tentative",
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id: "event-1",
    title: "Team sync",
    start: new Date("2026-05-27T10:00:00.000Z"),
    end: new Date("2026-05-27T11:00:00.000Z"),
    allDay: false,
    timezone: "UTC",
    isPrivate: false,
    isCancelled: false,
    isSynced: false,
    calendarId: "calendar-1",
    userId,
    externalId: "uid-123@google.com",
    participants: [
      {
        id: "participant-1",
        userId,
        email: "user@example.com",
        role: "attendee",
        status,
      },
    ],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("canCurrentUserDeleteEvent", () => {
  it("allows organizers to delete their own events", () => {
    const event = attendeeInviteEvent("accepted", {
      externalId: null,
      participants: [
        {
          id: "participant-1",
          userId,
          email: "user@example.com",
          role: "organizer",
          status: "accepted",
        },
      ],
    });

    expect(canCurrentUserDeleteEvent(event)).toBe(true);
  });

  it("blocks delete for synced events", () => {
    expect(
      canCurrentUserDeleteEvent(
        attendeeInviteEvent("accepted", { isSynced: true }),
      ),
    ).toBe(false);
  });

  it("blocks delete for pending ghost invitations", () => {
    expect(canCurrentUserDeleteEvent(attendeeInviteEvent("pending"))).toBe(
      false,
    );
  });

  it("blocks delete for tentative attendee invitations", () => {
    expect(canCurrentUserDeleteEvent(attendeeInviteEvent("tentative"))).toBe(
      false,
    );
  });

  it("allows delete for accepted attendee invitations", () => {
    expect(canCurrentUserDeleteEvent(attendeeInviteEvent("accepted"))).toBe(
      true,
    );
  });

  it("allows remove for cancelled attendee invitations", () => {
    expect(
      canCurrentUserDeleteEvent(
        attendeeInviteEvent("accepted", { isCancelled: true }),
      ),
    ).toBe(true);
  });
});

describe("canCurrentUserModifyEvent", () => {
  it("allows organizers to reschedule their own events", () => {
    expect(
      canCurrentUserModifyEvent(
        attendeeInviteEvent("accepted", {
          externalId: null,
          participants: [
            {
              id: "participant-1",
              userId,
              email: "user@example.com",
              role: "organizer",
              status: "accepted",
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("allows events with no participant list", () => {
    expect(
      canCurrentUserModifyEvent(
        attendeeInviteEvent("accepted", {
          externalId: null,
          participants: undefined,
        }),
      ),
    ).toBe(true);
  });

  it("blocks synced calendar events", () => {
    expect(
      canCurrentUserModifyEvent(
        attendeeInviteEvent("accepted", {
          externalId: null,
          participants: undefined,
          isSynced: true,
        }),
      ),
    ).toBe(false);
  });

  it("blocks cancelled events", () => {
    expect(
      canCurrentUserModifyEvent(
        attendeeInviteEvent("accepted", {
          externalId: null,
          participants: undefined,
          isCancelled: true,
        }),
      ),
    ).toBe(false);
  });

  it("blocks attendee invitations", () => {
    expect(canCurrentUserModifyEvent(attendeeInviteEvent("accepted"))).toBe(
      false,
    );
  });
});
