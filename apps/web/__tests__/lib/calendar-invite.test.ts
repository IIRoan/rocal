import { describe, expect, it } from "@jest/globals";
import {
  extractMailCalendarInvite,
  hasCalendarInvitationMetadata,
  listCalendarAttachmentCandidates,
} from "@/lib/mail/calendar-invite";

describe("mail calendar invite parsing", () => {
  it("extracts RSVP invite metadata from text/calendar body values", () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:google-event-1@example.com",
      "DTSTART:20260527T100000Z",
      "DTEND:20260527T110000Z",
      "SUMMARY:Planning sync",
      "LOCATION:Amsterdam",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const invite = extractMailCalendarInvite({
      message: {
        id: "mail-1",
        subject: "Invitation: Planning",
        bodyValues: {
          calendar: {
            value: icsContent,
          },
        },
      },
    });

    expect(invite).toEqual({
      uid: "google-event-1@example.com",
      method: "REQUEST",
      title: "Planning sync",
      location: "Amsterdam",
      start: new Date("2026-05-27T10:00:00.000Z"),
      end: new Date("2026-05-27T11:00:00.000Z"),
      icsContent,
    });
  });

  it("extracts RSVP invite metadata from decrypted ICS attachments", () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:google-event-2@example.com",
      "DTSTART:20260527T150000Z",
      "DTEND:20260527T160000Z",
      "SUMMARY:Attachment invite",
      "LOCATION:Brussels",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const invite = extractMailCalendarInvite({
      message: {
        id: "mail-2",
        subject: "google event",
      },
      attachments: [
        {
          name: "invite.ics",
          type: "text/calendar; method=REQUEST",
          content: new TextEncoder().encode(icsContent).buffer,
        },
      ],
    });

    expect(invite).toEqual({
      uid: "google-event-2@example.com",
      method: "REQUEST",
      title: "Attachment invite",
      location: "Brussels",
      start: new Date("2026-05-27T15:00:00.000Z"),
      end: new Date("2026-05-27T16:00:00.000Z"),
      icsContent,
    });
  });

  it("reads invitation dates from VEVENT instead of VTIMEZONE rules", () => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "METHOD:REQUEST",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Brussels",
      "BEGIN:DAYLIGHT",
      "DTSTART:19700329T020000",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:google-event-3@example.com",
      "DTSTART;TZID=Europe/Brussels:20260529T151500",
      "DTEND;TZID=Europe/Brussels:20260529T161500",
      "SUMMARY:Meet invite",
      "LOCATION:https://meet.google.com/jvo-kwba-ijs",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const invite = extractMailCalendarInvite({
      message: {
        id: "mail-3",
        subject: "Invitation: Meet invite",
        bodyValues: {
          calendar: {
            value: icsContent,
          },
        },
      },
    });

    expect(invite).toEqual({
      uid: "google-event-3@example.com",
      method: "REQUEST",
      title: "Meet invite",
      location: "https://meet.google.com/jvo-kwba-ijs",
      start: new Date("2026-05-29T15:15:00.000"),
      end: new Date("2026-05-29T16:15:00.000"),
      icsContent,
    });
  });

  it("parses non-request calendar messages so reply/cancel updates can sync", () => {
    expect(
      extractMailCalendarInvite({
        message: {
          id: "mail-1",
          bodyValues: {
            calendar: {
              value:
                "BEGIN:VCALENDAR\r\nMETHOD:REPLY\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:Accepted\r\nEND:VEVENT\r\nEND:VCALENDAR",
            },
          },
        },
      }),
    ).toEqual({
      uid: "x",
      method: "REPLY",
      title: "Accepted",
      location: undefined,
      start: undefined,
      end: undefined,
      icsContent:
        "BEGIN:VCALENDAR\r\nMETHOD:REPLY\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:Accepted\r\nEND:VEVENT\r\nEND:VCALENDAR",
    });
  });

  it("detects calendar invite metadata from blob-only attachments", () => {
    const message = {
      id: "mail-4",
      subject: "Bob invited you to Planning sync",
      attachments: [
        {
          blobId: "blob-ics-1",
          name: "invite.ics",
          type: "text/calendar; method=REQUEST",
        },
      ],
    };

    expect(hasCalendarInvitationMetadata(message)).toBe(true);
    expect(listCalendarAttachmentCandidates(message)).toEqual([
      {
        blobId: "blob-ics-1",
        name: "invite.ics",
        type: "text/calendar; method=REQUEST",
      },
    ]);
  });
});
