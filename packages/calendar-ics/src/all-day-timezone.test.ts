import { describe, expect, it } from "@jest/globals";

import { parseICSFile } from "./parse-ics";

function buildIcs(dateLines: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:holiday-1@example.com",
    ...dateLines,
    "SUMMARY:Holiday",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("ICS all-day timezone", () => {
  const cases = [
    ["plain DATE values", ["DTSTART;VALUE=DATE:20260922", "DTEND;VALUE=DATE:20260923"]],
    [
      "DATE values with a TZID",
      [
        "DTSTART;TZID=America/New_York;VALUE=DATE:20260922",
        "DTEND;TZID=America/New_York;VALUE=DATE:20260923",
      ],
    ],
  ] as const;

  for (const [label, dateLines] of cases) {
    it(`stores ${label} in the timezone the range was encoded in`, () => {
      const [event] = parseICSFile(buildIcs([...dateLines]), "Europe/Amsterdam").events;

      expect(event?.allDay).toBe(true);
      expect(event?.timezone).toBe("Europe/Amsterdam");
      expect(event?.start.toISOString()).toBe("2026-09-21T22:00:00.000Z");
      expect(event?.end.toISOString()).toBe("2026-09-22T21:59:59.999Z");
    });
  }

  it("keeps the event timezone for timed events", () => {
    const [event] = parseICSFile(
      buildIcs([
        "DTSTART;TZID=America/New_York:20260922T090000",
        "DTEND;TZID=America/New_York:20260922T100000",
      ]),
      "Europe/Amsterdam",
    ).events;

    expect(event?.allDay).toBe(false);
    expect(event?.timezone).toBe("America/New_York");
  });
});
