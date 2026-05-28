import { describe, expect, it } from "@jest/globals";

import { buildIcsEventFile } from "./index";
import { parseICSFile } from "./parse-ics";

describe("calendar ICS participants", () => {
  it("parses organizer and attendees from ICS events", () => {
    const parsed = parseICSFile(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        "UID:event-1@example.com",
        "DTSTART:20260527T100000Z",
        "DTEND:20260527T110000Z",
        "SUMMARY:Planning sync",
        "ORGANIZER;CN=Owner:mailto:owner@example.com",
        "ATTENDEE;CN=Teammate;PARTSTAT=ACCEPTED:mailto:teammate@example.com",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      "UTC",
    );

    expect(parsed.events[0]?.participants).toEqual([
      expect.objectContaining({
        email: "owner@example.com",
        role: "organizer",
        status: "accepted",
      }),
      expect.objectContaining({
        email: "teammate@example.com",
        role: "attendee",
        status: "accepted",
      }),
    ]);
  });

  it("writes organizer and attendees into exported ICS files", () => {
    const ics = buildIcsEventFile({
      calendar: {
        name: "Primary",
        timezone: "UTC",
        method: "REQUEST",
      },
      event: {
        uid: "event-1@example.com",
        title: "Planning sync",
        start: new Date("2026-05-27T10:00:00.000Z"),
        end: new Date("2026-05-27T11:00:00.000Z"),
        timezone: "UTC",
        participants: [
          {
            email: "owner@example.com",
            displayName: "Owner",
            role: "organizer",
            status: "accepted",
          },
          {
            email: "teammate@example.com",
            displayName: "Teammate",
            role: "attendee",
            status: "pending",
          },
        ],
      },
    });

    expect(ics).toContain(
      "ORGANIZER;CN=Owner:mailto:owner@example.com",
    );
    expect(ics).toContain(
      "ATTENDEE;CN=Teammate;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:teammate@example.com",
    );
  });
});
