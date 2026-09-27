import { parseIcsImport } from "../ics-import";

const wrap = (event: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Private\r\n${event}\r\nEND:VCALENDAR`;

describe("on-device ICS import", () => {
  it("parses multiple events, folded content, timezone and recurrence", () => {
    const result = parseIcsImport(
      wrap(`BEGIN:VEVENT
UID:private@example.com
DTSTART;TZID=Europe/Amsterdam:20260329T100000
DTEND;TZID=Europe/Amsterdam:20260329T110000
SUMMARY:Private
 appointment
DESCRIPTION:Line one\\nLine two
RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=SU
EXDATE;TZID=Europe/Amsterdam:20260405T100000
END:VEVENT
BEGIN:VEVENT
UID:holiday
DTSTART;VALUE=DATE:20260329
DTEND;VALUE=DATE:20260331
SUMMARY:Holiday
END:VEVENT`),
      "Europe/Amsterdam",
    );
    expect(result.errors).toEqual([]);
    expect(result.events[0]).toMatchObject({
      title: "Privateappointment",
      description: "Line one\nLine two",
      start: "2026-03-29T08:00:00.000Z",
      end: "2026-03-29T09:00:00.000Z",
      excludedDates: ["2026-04-05T08:00:00.000Z"],
    });
    expect(JSON.parse(result.events[0]?.recurrence ?? "{}")).toMatchObject({
      frequency: "weekly",
      count: 3,
      byWeekDay: [0],
    });
    expect(result.events[1]).toMatchObject({
      allDay: true,
      start: "2026-03-28T23:00:00.000Z",
      end: "2026-03-30T21:59:59.999Z",
    });
  });

  it("keeps recurrence overrides associated with their source series", () => {
    const result = parseIcsImport(
      wrap(`BEGIN:VEVENT
UID:series
RECURRENCE-ID:20260601T090000Z
DTSTART:20260601T110000Z
DTEND:20260601T120000Z
SUMMARY:Moved
END:VEVENT`),
      "UTC",
    );
    expect(result.events[0]).toMatchObject({
      sourceUid: "series",
      occurrenceDate: "2026-06-01T09:00:00.000Z",
    });
  });

  it("rejects malformed input without echoing its contents", () => {
    expect(() => parseIcsImport("private garbage", "UTC")).toThrow(
      "Invalid calendar file",
    );
  });

  it("keeps UTC recurrence in UTC and supplies the existing one-hour default duration", () => {
    const result = parseIcsImport(
      wrap(`BEGIN:VEVENT
UID:utc
DTSTART:20260328T090000Z
SUMMARY:UTC meeting
RRULE:FREQ=DAILY
END:VEVENT`),
      "Europe/Amsterdam",
    );
    expect(result.events[0]).toMatchObject({
      timezone: "UTC",
      end: "2026-03-28T10:00:00.000Z",
    });
    expect(JSON.parse(result.events[0]?.recurrence ?? "{}")).toMatchObject({
      timezone: "UTC",
    });
  });
});
