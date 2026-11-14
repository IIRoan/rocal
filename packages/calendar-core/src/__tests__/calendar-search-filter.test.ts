import { describe, expect, it } from "@jest/globals";
import {
  CALENDAR_SEARCH_OPERATOR_KEYS,
  MAIL_SEARCH_OPERATOR_KEYS,
  filterEventsBySearchOperators,
  parseSearchQuery,
  searchCalendarEvents,
  type CalendarEvent,
} from "../index";

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: "event",
  title: "Event",
  start: new Date("2026-05-01T10:00:00.000Z"),
  end: new Date("2026-05-01T11:00:00.000Z"),
  calendarId: "cal-work",
  userId: "user-1",
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
  ...overrides,
});

const participant = (email: string, displayName: string | null = null) => ({
  id: email,
  eventId: "event",
  email,
  displayName,
  role: "attendee" as const,
  status: "accepted" as const,
});

const weeklyRule = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ frequency: "weekly", interval: 1, ...extra });

const events = [
  event({
    id: "lunch",
    title: "Team lunch",
    location: "Café Utrecht",
    participants: [participant("ana@example.com", "Ana Silva")],
  }),
  event({ id: "offsite", title: "Offsite", calendarId: "cal-home", allDay: true }),
  event({ id: "standup", title: "Standup", recurrence: weeklyRule() }),
  event({ id: "override", title: "Standup moved", parentEventId: "standup" }),
  event({ id: "notes", title: "Planning", description: "Draft agenda" }),
];

const context = {
  timezone: "Europe/Amsterdam",
  calendars: [
    { id: "cal-work", name: "Work" },
    { id: "cal-home", name: "Home" },
  ],
};

const filterIds = (query: string, list = events) =>
  filterEventsBySearchOperators(
    list,
    parseSearchQuery(query, CALENDAR_SEARCH_OPERATOR_KEYS).operators,
    context,
  ).map((item) => item.id);

describe("filterEventsBySearchOperators", () => {
  it.each<[string, string[]]>([
    ["guest:ana", ["lunch"]],
    ["guest:silva", ["lunch"]],
    ["-guest:ana", ["offsite", "standup", "override", "notes"]],
    ["location:utrecht", ["lunch"]],
    ["calendar:home", ["offsite"]],
    ["-calendar:home", ["lunch", "standup", "override", "notes"]],
    ["is:recurring", ["standup", "override"]],
    ["is:allday", ["offsite"]],
    ["is:all-day", ["offsite"]],
    ["-is:allday", ["lunch", "standup", "override", "notes"]],
    ["-draft", ["lunch", "offsite", "standup", "override"]],
    ["-café", ["offsite", "standup", "override", "notes"]],
  ])("%s", (query, expected) => {
    expect(filterIds(query)).toEqual(expected);
  });

  it("falls back to the event's own calendar name", () => {
    const item = event({
      id: "own",
      calendarId: "cal-gone",
      calendar: { name: "Archive" } as CalendarEvent["calendar"],
    });
    expect(filterIds("calendar:archive", [item])).toEqual(["own"]);
  });

  it("reads after: and before: as midnight in the account time zone across DST", () => {
    // Europe/Amsterdam switches to CEST on 2026-03-29, so that midnight is 2026-03-28T23:00Z.
    const late = event({
      id: "late",
      start: new Date("2026-03-28T22:30:00.000Z"),
      end: new Date("2026-03-28T22:59:00.000Z"),
    });
    const midnight = event({
      id: "midnight",
      start: new Date("2026-03-28T23:00:00.000Z"),
      end: new Date("2026-03-28T23:30:00.000Z"),
    });
    expect(filterIds("after:2026-03-29", [late, midnight])).toEqual(["midnight"]);
    expect(filterIds("before:2026-03-29", [late, midnight])).toEqual(["late"]);
  });

  it("keeps a series that runs past after: unless its rule ended first", () => {
    const start = new Date("2026-01-05T09:00:00.000Z");
    const end = new Date("2026-01-05T10:00:00.000Z");
    const series = [
      event({ id: "open", start, end, recurrence: weeklyRule() }),
      event({ id: "until-late", start, end, recurrence: weeklyRule({ until: "2026-12-31T00:00:00.000Z" }) }),
      event({ id: "until-early", start, end, recurrence: weeklyRule({ until: "2026-02-01T00:00:00.000Z" }) }),
      event({ id: "count-late", start, end, recurrence: weeklyRule({ count: 52 }) }),
      event({ id: "count-early", start, end, recurrence: weeklyRule({ count: 2 }) }),
    ];
    expect(filterIds("after:2026-06-01", series)).toEqual([
      "open",
      "until-late",
      "count-late",
    ]);
  });

  it.each(["is:unread", "after:tomorrow", "before:2026-11-01T10:00"])(
    "returns nothing for the value it cannot honour: %s",
    (query) => {
      expect(filterIds(query)).toEqual([]);
    },
  );

  it("returns nothing for a mail-only operator", () => {
    const union = new Set([...CALENDAR_SEARCH_OPERATOR_KEYS, ...MAIL_SEARCH_OPERATOR_KEYS]);
    const parsed = parseSearchQuery("from:ana lunch", union);
    expect(filterEventsBySearchOperators(events, parsed.operators, context)).toEqual([]);
  });
});

describe("searchCalendarEvents with operators", () => {
  const search = (query: string) =>
    searchCalendarEvents(
      events,
      parseSearchQuery(query, CALENDAR_SEARCH_OPERATOR_KEYS),
      10,
      context,
    ).map((result) => result.eventId);

  it("lists every filtered event for an operator-only query", () => {
    expect(search("is:recurring").sort()).toEqual(["override", "standup"]);
  });

  it("scores the remaining words within the filtered events", () => {
    expect(search("standup -moved")).toEqual(["standup"]);
  });

  it("requires a quoted phrase to appear as written", () => {
    expect(search('"team lunch"')).toEqual(["lunch"]);
    expect(search('"lunch team"')).toEqual([]);
  });

  it("returns nothing for an empty parse", () => {
    expect(search('""')).toEqual([]);
  });
});
