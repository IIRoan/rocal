import { describe, expect, it } from "@jest/globals";

import type { CalendarEvent } from "./types";
import {
  getInvitationResponseStatus,
  shouldShowInvitationActions,
} from "./types";

function makeEvent(
  overrides: Partial<CalendarEvent> & {
    participants?: CalendarEvent["participants"];
  },
): CalendarEvent {
  return {
    id: "evt-1",
    title: "Standup",
    start: new Date("2026-08-24T09:00:00.000Z"),
    end: new Date("2026-08-24T09:30:00.000Z"),
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CalendarEvent;
}

describe("invitation actions", () => {
  it("hides RSVP for organizers and cancelled events", () => {
    const organizerEvent = makeEvent({
      participants: [
        {
          id: "p-1",
          eventId: "evt-1",
          userId: "user-1",
          email: "me@solace.onl",
          role: "organizer",
          status: "accepted",
        },
      ],
    });
    expect(shouldShowInvitationActions(organizerEvent)).toBe(false);
    expect(getInvitationResponseStatus(organizerEvent, true)).toBeNull();

    expect(
      shouldShowInvitationActions(
        makeEvent({
          isCancelled: true,
          participants: [
            {
              id: "p-2",
              eventId: "evt-1",
              userId: "user-1",
              email: "me@solace.onl",
              role: "attendee",
              status: "pending",
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("shows RSVP for invitees and reports accepted or tentative status", () => {
    const pending = makeEvent({
      participants: [
        {
          id: "p-2",
          eventId: "evt-1",
          userId: "user-1",
          email: "me@solace.onl",
          role: "attendee",
          status: "pending",
        },
      ],
    });
    expect(shouldShowInvitationActions(pending)).toBe(true);
    expect(getInvitationResponseStatus(pending, false)).toBeNull();

    const accepted = makeEvent({
      participants: [
        {
          id: "p-2",
          eventId: "evt-1",
          userId: "user-1",
          email: "me@solace.onl",
          role: "attendee",
          status: "accepted",
        },
      ],
    });
    expect(getInvitationResponseStatus(accepted, false)).toBe("accepted");
  });
});
