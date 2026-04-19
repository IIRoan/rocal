import { describe, expect, it } from "@jest/globals";
import { buildIcsCalendar } from "@workspace/calendar-ics";
import { parseICSFile } from "@workspace/calendar-ics/parse-ics";

function unfoldIcs(icsContent: string): string {
  return icsContent.replace(/\r\n[ \t]/g, "");
}

function getFoldedPropertyLines(
  icsContent: string,
  propertyPrefix: string,
): string[] {
  const lines = icsContent.split("\r\n");
  const startIndex = lines.findIndex((line) => line.startsWith(propertyPrefix));

  if (startIndex === -1) {
    return [];
  }

  const propertyLines = [lines[startIndex]];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (!lines[index].startsWith(" ")) {
      break;
    }

    propertyLines.push(lines[index]);
  }

  return propertyLines;
}

describe("calendar-ics standards", () => {
  it("emits VCALENDAR content with CRLF line endings", () => {
    const icsContent = buildIcsCalendar({
      calendar: { name: "Team Calendar" },
      events: [
        {
          title: "Planning",
          start: new Date("2024-02-01T10:00:00.000Z"),
          end: new Date("2024-02-01T11:00:00.000Z"),
        },
      ],
    });

    expect(icsContent.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(icsContent.endsWith("\r\n")).toBe(true);
    expect(icsContent.replace(/\r\n/g, "")).not.toContain("\n");
    expect(icsContent).toContain("VERSION:2.0\r\n");
    expect(icsContent).toContain("BEGIN:VEVENT\r\n");
    expect(icsContent).toContain("END:VEVENT\r\nEND:VCALENDAR\r\n");
  });

  it("folds long property lines to the RFC 5545 octet limit", () => {
    const longDescription = "A".repeat(120);
    const icsContent = buildIcsCalendar({
      calendar: { name: "Long Lines" },
      events: [
        {
          title: "Planning",
          description: longDescription,
          start: new Date("2024-02-01T10:00:00.000Z"),
          end: new Date("2024-02-01T11:00:00.000Z"),
        },
      ],
    });

    const descriptionLines = getFoldedPropertyLines(icsContent, "DESCRIPTION:");

    expect(descriptionLines.length).toBeGreaterThan(1);
    for (const line of descriptionLines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }

    expect(unfoldIcs(icsContent)).toContain(`DESCRIPTION:${longDescription}`);
  });

  it("exports all-day events using timezone-local dates with exclusive DTEND", () => {
    const icsContent = unfoldIcs(
      buildIcsCalendar({
        calendar: {
          name: "Team Calendar",
          timezone: "Europe/Amsterdam",
        },
        events: [
          {
            title: "Founders Day",
            start: new Date("2024-01-31T23:00:00.000Z"),
            end: new Date("2024-02-01T22:59:59.999Z"),
            allDay: true,
            timezone: "Europe/Amsterdam",
          },
        ],
      }),
    );

    expect(icsContent).toContain("DTSTART;VALUE=DATE:20240201");
    expect(icsContent).toContain("DTEND;VALUE=DATE:20240202");
  });

  it("round-trips single-day all-day imports without expanding them", () => {
    const parsedResult = parseICSFile(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:single-day",
        "DTSTART;VALUE=DATE:20240201",
        "DTEND;VALUE=DATE:20240202",
        "SUMMARY:Single-day holiday",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      "UTC",
    );

    expect(parsedResult.errors).toEqual([]);
    expect(parsedResult.events).toHaveLength(1);

    const parsedEvent = parsedResult.events[0];
    const icsContent = unfoldIcs(
      buildIcsCalendar({
        calendar: { name: "Imported Calendar" },
        events: [
          {
            uid: parsedEvent.uid,
            title: parsedEvent.title,
            start: parsedEvent.start,
            end: parsedEvent.end,
            allDay: parsedEvent.allDay,
          },
        ],
      }),
    );

    expect(icsContent).toContain("DTSTART;VALUE=DATE:20240201");
    expect(icsContent).toContain("DTEND;VALUE=DATE:20240202");
    expect(icsContent).not.toContain("DTEND;VALUE=DATE:20240203");
  });

  it("preserves URI-valued URL properties without TEXT escaping", () => {
    const sourceUrl = "https://example.com/calendar?tag=a,b;value=1";
    const icsContent = unfoldIcs(
      buildIcsCalendar({
        calendar: {
          name: "Linked Calendar",
          sourceUrl,
        },
        events: [
          {
            title: "Linked Event",
            start: new Date("2024-02-01T10:00:00.000Z"),
            end: new Date("2024-02-01T11:00:00.000Z"),
            sourceUrl,
          },
        ],
      }),
    );

    expect(icsContent).toContain(`URL:${sourceUrl}`);
    expect(icsContent).not.toContain(
      "URL:https://example.com/calendar?tag=a\\,b\\;value=1",
    );
  });
});