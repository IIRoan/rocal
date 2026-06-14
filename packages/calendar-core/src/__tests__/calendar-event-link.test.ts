import { describe, expect, it } from "@jest/globals";

import {
  extractLinkedCalendarEventId,
  extractReminderLeadMinutes,
  isSolaceEventInvitationEmail,
  isSolaceEventReminderEmail,
} from "../calendar-event-link";

describe("calendar-event-link", () => {
  it("extracts event ids from reminder bodies and links", () => {
    expect(
      extractLinkedCalendarEventId({
        subject: "Encrypted event in 15 minutes",
        bodies: [
          "Event ID: cmpvub2pu0015tu98rvydw8is",
          "Open event: https://solace.onl/calendar?eventId=cmpvub2pu0015tu98rvydw8is",
        ],
      }),
    ).toBe("cmpvub2pu0015tu98rvydw8is");
  });

  it("detects Solace reminder emails", () => {
    const source = {
      subject: "Encrypted event in 15 minutes",
      bodies: [
        "Encrypted event",
        "Event ID: event-1",
        "Open event: https://solace.onl/calendar?eventId=event-1",
      ],
    };

    expect(isSolaceEventReminderEmail(source)).toBe(true);
    expect(extractReminderLeadMinutes(source)).toBe(15);
  });

  it("does not classify Solace invitation emails as reminders", () => {
    const source = {
      subject: "Bob invited you to Planning sync",
      bodies: [
        "Bob invited you to Planning sync on Solace.",
        "Open event: https://solace.onl/calendar?eventId=organizer-event-1",
      ],
    };

    expect(isSolaceEventInvitationEmail(source)).toBe(true);
    expect(isSolaceEventReminderEmail(source)).toBe(false);
  });
});
