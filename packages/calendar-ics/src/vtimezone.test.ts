import { describe, expect, it } from "@jest/globals";

import { buildIcsCalendar, buildVTimezoneLines, type IcsBuildEventInput } from "./index";
import { parseICSFile } from "./parse-ics";
import { RecurrenceEngine } from "./recurrence";

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

function observance(lines: string[], kind: "STANDARD" | "DAYLIGHT"): string[] {
  const start = lines.indexOf(`BEGIN:${kind}`);
  return lines.slice(start + 1, lines.indexOf(`END:${kind}`, start));
}

const weekly: IcsBuildEventInput = {
  uid: "series@solace-calendar.local",
  title: "Standup",
  start: new Date("2026-01-05T08:00:00.000Z"),
  end: new Date("2026-01-05T08:30:00.000Z"),
  timezone: "Europe/Amsterdam",
  recurrence: { frequency: "weekly", interval: 1 },
};

describe("buildVTimezoneLines", () => {
  it("encodes Amsterdam's last-Sunday rules from a 1970 onset", () => {
    const lines = buildVTimezoneLines("Europe/Amsterdam", 2026);
    expect(lines.slice(0, 2)).toEqual(["BEGIN:VTIMEZONE", "TZID:Europe/Amsterdam"]);
    expect(observance(lines, "DAYLIGHT")).toEqual([
      "DTSTART:19700329T020000",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    ]);
    expect(observance(lines, "STANDARD")).toEqual([
      "DTSTART:19701025T030000",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    ]);
  });

  it("encodes New York's second and first Sundays", () => {
    const lines = buildVTimezoneLines("America/New_York", 2026);
    expect(observance(lines, "DAYLIGHT")).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU");
    expect(observance(lines, "STANDARD")).toContain("RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU");
    expect(observance(lines, "STANDARD")).toContain("TZOFFSETTO:-0500");
  });

  it("puts Sydney's daylight time in the southern spring", () => {
    const lines = buildVTimezoneLines("Australia/Sydney", 2026);
    expect(observance(lines, "DAYLIGHT")).toEqual([
      "DTSTART:19701004T020000",
      "TZOFFSETFROM:+1000",
      "TZOFFSETTO:+1100",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
    ]);
    expect(observance(lines, "STANDARD")).toContain("RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU");
  });

  it("writes one standard observance for a zone without daylight time", () => {
    expect(buildVTimezoneLines("Asia/Tokyo", 2026)).toEqual([
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Tokyo",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0900",
      "TZOFFSETTO:+0900",
      "END:STANDARD",
      "END:VTIMEZONE",
    ]);
  });
});

describe("buildIcsCalendar time zones", () => {
  it("writes a series in its zone with one VTIMEZONE before the events", () => {
    const ics = unfold(
      buildIcsCalendar({
        calendar: { name: "Work" },
        events: [
          { ...weekly, exceptionDates: [new Date("2026-01-12T08:00:00.000Z"), new Date("2026-07-13T07:00:00.000Z")] },
          {
            uid: weekly.uid,
            title: "Standup, later",
            start: new Date("2026-01-19T10:00:00.000Z"),
            end: new Date("2026-01-19T10:30:00.000Z"),
            timezone: "Europe/Amsterdam",
            recurrenceId: new Date("2026-01-19T08:00:00.000Z"),
          },
        ],
      }),
    );

    expect(ics.match(/BEGIN:VTIMEZONE/g)).toHaveLength(1);
    expect(ics.indexOf("END:VTIMEZONE")).toBeLessThan(ics.indexOf("BEGIN:VEVENT"));
    expect(ics).toContain("DTSTART;TZID=Europe/Amsterdam:20260105T090000");
    expect(ics).toContain("DTEND;TZID=Europe/Amsterdam:20260105T093000");
    expect(ics).toContain("EXDATE;TZID=Europe/Amsterdam:20260112T090000,20260713T090000");
    expect(ics).toContain("RECURRENCE-ID;TZID=Europe/Amsterdam:20260119T090000");
  });

  it("writes all-day exceptions and overrides as dates", () => {
    const ics = unfold(
      buildIcsCalendar({
        calendar: { name: "Home", timezone: "Europe/Amsterdam" },
        events: [
          {
            uid: "trash-day",
            title: "Bins",
            start: new Date("2026-01-04T23:00:00.000Z"),
            end: new Date("2026-01-05T22:59:59.999Z"),
            allDay: true,
            recurrence: { frequency: "weekly", interval: 1 },
            exceptionDates: [new Date("2026-01-11T23:00:00.000Z")],
          },
          {
            uid: "trash-day",
            title: "Bins, a day late",
            start: new Date("2026-01-19T23:00:00.000Z"),
            end: new Date("2026-01-20T22:59:59.999Z"),
            allDay: true,
            recurrenceId: new Date("2026-01-18T23:00:00.000Z"),
          },
        ],
      }),
    );

    expect(ics).not.toContain("VTIMEZONE");
    expect(ics).toContain("EXDATE;VALUE=DATE:20260112");
    expect(ics).toContain("RECURRENCE-ID;VALUE=DATE:20260119");
  });

  it("keeps UTC series and single events in UTC without a VTIMEZONE", () => {
    const ics = unfold(
      buildIcsCalendar({
        calendar: { name: "Work" },
        events: [
          { ...weekly, uid: "utc", timezone: "UTC", exceptionDates: [new Date("2026-01-12T08:00:00.000Z")] },
          { ...weekly, uid: "single", recurrence: undefined },
        ],
      }),
    );

    expect(ics).not.toContain("TZID");
    expect(ics).toContain("EXDATE:20260112T080000Z");
    expect(ics).toContain("DTSTART:20260105T080000Z");
  });

  it("round-trips a weekly 09:00 Amsterdam series that stays at 09:00 in July", () => {
    const [series] = parseICSFile(buildIcsCalendar({ calendar: { name: "Work" }, events: [weekly] })).events;
    expect(series?.timezone).toBe("Europe/Amsterdam");
    expect(series?.start.toISOString()).toBe(weekly.start.toISOString());
    if (!series?.recurrence) throw new Error("The series lost its rule");

    const [july] = RecurrenceEngine.generateInstances(
      {
        id: series.uid,
        start: series.start,
        end: series.end,
        recurrence: JSON.stringify({ ...series.recurrence, timezone: series.timezone }),
      },
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-08T00:00:00.000Z"),
    );
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Amsterdam",
      hour: "2-digit",
      minute: "2-digit",
    }).format(july?.date);
    expect(localTime).toBe("09:00");
  });
});
