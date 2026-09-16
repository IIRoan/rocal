import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth-email", () => ({
  sendAuthEmail: jest.fn(async () => ({ delivered: true, channel: "stalwart" })),
}));

import { sendAuthEmail } from "../../lib/auth-email";
import {
  buildEventRsvpReplyIcs,
  sendEventRsvpReply,
} from "../../lib/event-rsvp-reply";

const mockSendAuthEmail = sendAuthEmail as jest.MockedFunction<
  typeof sendAuthEmail
>;

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const BASE = {
  organizerEmail: "organizer@example.com",
  attendeeEmail: "alice@solace.onl",
  from: "Solace <noreply@solace.onl>",
  title: "Design review",
  uid: "event-1@solace-calendar.local",
  start: new Date("2026-05-06T10:00:00.000Z"),
  end: new Date("2026-05-06T11:00:00.000Z"),
  allDay: false,
  timezone: "Europe/Amsterdam",
  mailerClient: null,
  logger,
  isProduction: false,
};

describe("event RSVP reply", () => {
  it("builds a REPLY carrying the attendee's PARTSTAT and the original UID", () => {
    const ics = buildEventRsvpReplyIcs({
      uid: "event-1@solace-calendar.local",
      title: "Design review",
      start: BASE.start,
      end: BASE.end,
      allDay: false,
      timezone: "Europe/Amsterdam",
      organizerEmail: "organizer@example.com",
      attendeeEmail: "alice@solace.onl",
      status: "accepted",
    });

    expect(ics).toContain("METHOD:REPLY");
    expect(ics).toContain("UID:event-1@solace-calendar.local");
    expect(ics).toContain("PARTSTAT=ACCEPTED");
    expect(ics).toContain("alice@solace.onl");
  });

  it("emails the organizer with the reply attached", async () => {
    mockSendAuthEmail.mockClear();

    await sendEventRsvpReply({ ...BASE, status: "declined" });

    expect(mockSendAuthEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "organizer@example.com",
        label: "event RSVP reply",
        message: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: "reply.ics",
              contentType: "text/calendar; method=REPLY; charset=utf-8",
            }),
          ],
        }),
      }),
    );
  });

  it("never replies to itself or to a reserved system address", async () => {
    mockSendAuthEmail.mockClear();

    await sendEventRsvpReply({
      ...BASE,
      organizerEmail: "alice@solace.onl",
      status: "accepted",
    });
    await sendEventRsvpReply({
      ...BASE,
      organizerEmail: "noreply@solace.onl",
      status: "accepted",
    });

    expect(mockSendAuthEmail).not.toHaveBeenCalled();
  });
});
