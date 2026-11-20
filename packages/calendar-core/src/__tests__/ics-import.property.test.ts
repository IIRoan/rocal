import { describe, expect, it } from "@jest/globals";
import fc from "fast-check";
import { buildIcsEventFile } from "@workspace/calendar-ics";

import { parseIcsImport } from "../ics-import";
import { parseMailCalendarInviteFromIcs } from "../mail-calendar-invite";
import { icsEventArb } from "./property-test-arbitraries";

const KNOWN_ERRORS = new Set(["Invalid calendar file", "Calendar file contains too many events"]);
const DAY_MS = 86_400_000;

const ICS_SOUP_TOKENS = [
  "BEGIN:VCALENDAR\r\n", "END:VCALENDAR\r\n", "BEGIN:VEVENT\r\n", "END:VEVENT\r\n", "VERSION:2.0\r\n",
  "UID:x\r\n", "SUMMARY:a\\,b\\nc\r\n", "DTSTART:20260101T100000Z\r\n", "DTSTART;VALUE=DATE:20260101\r\n",
  "DTSTART;TZID=Europe/Amsterdam:20260101T100000\r\n", "DTSTART;TZID=Mars/Base:20260101T100000\r\n",
  "DTSTART:99991231T235959Z\r\n", "DTSTART:00000101\r\n", "DTEND:20260101T090000Z\r\n",
  "DTEND;VALUE=DATE:20251231\r\n", "DURATION:PT1H\r\n", "DURATION:-PT1H\r\n", "DURATION:P9999999W\r\n",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,1TU\r\n", "RRULE:FREQ=SECONDLY\r\n", "RRULE:FREQ=DAILY;COUNT=0\r\n",
  "RRULE:FREQ=YEARLY;UNTIL=19000101\r\n", "RRULE:INTERVAL=0\r\n", "EXDATE:20260108T100000Z\r\n",
  "EXDATE;VALUE=DATE:2026\r\n", "RDATE:20260102T100000Z\r\n", "RECURRENCE-ID:20260101T100000Z\r\n",
  "ORGANIZER;CN=x:mailto:a@b.test\r\n", "ATTENDEE;PARTSTAT=ACCEPTED:mailto:\r\n", "ATTENDEE:mailto:root@localhost\r\n",
  "X-WR-TIMEZONE:Mars/Base\r\n", "X-WR-CALNAME:x\r\n", "METHOD:REQUEST\r\n", "BEGIN:VTIMEZONE\r\n",
  "TZID:Europe/Amsterdam\r\n", "END:VTIMEZONE\r\n", " folded\r\n", ";", ":", "=", "\r\n", "\n",
];
const icsSoupArb = fc
  .array(fc.oneof(fc.constantFrom(...ICS_SOUP_TOKENS), fc.string({ maxLength: 8 })), { maxLength: 40 })
  .map((parts) => parts.join(""));

function isIsoInstant(value: string): boolean {
  return new Date(value).toISOString() === value;
}

/** Parses or refuses with a known message; every event it keeps has ordered ISO instants. */
function expectImportContract(content: string) {
  let parsed: ReturnType<typeof parseIcsImport>;
  try {
    parsed = parseIcsImport(content, "UTC");
  } catch (error) {
    expect(KNOWN_ERRORS).toContain(error instanceof Error ? error.message : "");
    return;
  }
  for (const event of parsed.events) {
    expect(isIsoInstant(event.start) && isIsoInstant(event.end)).toBe(true);
    expect(Date.parse(event.start)).toBeLessThan(Date.parse(event.end));
  }
}

function localDateStamp(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(instant);
}

const wallClock = (instant: number, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hourCycle: "h23", dateStyle: "short", timeStyle: "medium" })
    .format(instant);

/** A series exports in its zone with today's DST rules, so it reads back exactly from 2012 on, outside the repeated fall-back hour. */
function readsBackExactly(event: { start: Date; end: Date; allDay: boolean; timezone: string; recurrence?: unknown }) {
  if (!event.recurrence || event.allDay || event.timezone === "UTC") return true;
  const unambiguous = (instant: number) =>
    [-60, -30, 30, 60].every((minutes) => wallClock(instant + minutes * 60_000, event.timezone) !== wallClock(instant, event.timezone));
  return event.start.getUTCFullYear() >= 2012 && unambiguous(event.start.getTime()) && unambiguous(event.end.getTime());
}

const validIcsArb = icsEventArb.map((event) => buildIcsEventFile({ calendar: { name: "x" }, event }));

const mutationArb = fc.array(
  fc.record({
    kind: fc.constantFrom("drop" as const, "duplicate" as const, "truncate" as const),
    line: fc.nat(),
    at: fc.nat(),
  }),
  { minLength: 1, maxLength: 4 },
);

describe("parseIcsImport", () => {
  it("refuses only with known messages and keeps only ordered events", () => {
    fc.assert(
      fc.property(fc.oneof(icsSoupArb, fc.string()), (content) => expectImportContract(content)),
      { numRuns: 200 },
    );
  });

  it("keeps the same contract when lines of a valid file are dropped, duplicated or cut", () => {
    fc.assert(
      fc.property(validIcsArb, mutationArb, (ics, mutations) => {
        const lines = ics.split("\r\n");
        for (const { kind, line, at } of mutations) {
          const index = line % lines.length;
          const current = lines[index] ?? "";
          if (kind === "drop") lines.splice(index, 1);
          else if (kind === "duplicate") lines.splice(index, 0, current);
          else lines[index] = current.slice(0, at % (current.length + 1));
        }
        expectImportContract(lines.join("\r\n"));
      }),
      { numRuns: 100 },
    );
  });

  it("reads back the event buildIcsEventFile wrote", () => {
    fc.assert(
      fc.property(icsEventArb.filter(readsBackExactly), (event) => {
        const parsed = parseIcsImport(buildIcsEventFile({ calendar: { name: "x" }, event }), "UTC");
        expect(parsed.errors).toEqual([]);
        expect(parsed.events).toHaveLength(1);
        const [imported] = parsed.events;
        expect(imported?.title).toBe(event.title.trim());
        expect(imported?.description).toBe(event.description.trim() || undefined);
        expect(imported?.location).toBe(event.location.trim() || undefined);
        if (event.timezone === "UTC" || (event.recurrence && !event.allDay)) expect(imported?.timezone).toBe(event.timezone);
        if (event.allDay) {
          const startDay = Date.parse(`${localDateStamp(event.start, event.timezone)}T00:00:00.000Z`);
          const endDay = Date.parse(`${localDateStamp(event.end, event.timezone)}T00:00:00.000Z`);
          expect(imported?.start).toBe(new Date(startDay).toISOString());
          expect(imported?.end).toBe(new Date(endDay + DAY_MS - 1).toISOString());
        } else {
          expect(imported?.start).toBe(event.start.toISOString());
          expect(imported?.end).toBe(event.end.toISOString());
        }
        const recurrence = imported?.recurrence ? JSON.parse(imported.recurrence) : undefined;
        expect(recurrence && {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          count: recurrence.count,
          until: recurrence.until,
          byWeekDay: recurrence.byWeekDay,
        }).toEqual(event.recurrence && {
          frequency: event.recurrence.frequency,
          interval: event.recurrence.interval,
          count: event.recurrence.count,
          until: event.recurrence.until,
          byWeekDay: event.recurrence.byWeekDay,
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe("parseMailCalendarInviteFromIcs", () => {
  it("never throws on any input", () => {
    fc.assert(
      fc.property(fc.oneof(icsSoupArb, fc.string()), (content) => {
        const invite = parseMailCalendarInviteFromIcs(content);
        expect(invite === null || typeof invite.uid === "string").toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
