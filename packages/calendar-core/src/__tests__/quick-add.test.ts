import { describe, expect, it } from "@jest/globals";
import fc from "fast-check";
import { formatQuickAddSummary, parseQuickAdd } from "../index";

// Saturday 14 November 2026, 11:00 in Amsterdam (CET, UTC+1).
const options = {
  now: new Date("2026-11-14T10:00:00.000Z"),
  timezone: "Europe/Amsterdam",
  defaultDurationMinutes: 60,
};

const parse = (input: string) => {
  const result = parseQuickAdd(input, options);
  return result && {
    title: result.title,
    start: result.start.toISOString(),
    end: result.end.toISOString(),
    allDay: result.allDay,
  };
};

const timed = (title: string, start: string, end: string) => ({
  title,
  start: `${start}:00.000Z`,
  end: `${end}:00.000Z`,
  allDay: false,
});

const allDay = (title: string, day: string, next: string) => ({
  title,
  start: `${next}T23:00:00.000Z`,
  end: `${day}T22:59:59.000Z`,
  allDay: true,
});

describe("parseQuickAdd", () => {
  it.each([
    ["Lunch with Ana tomorrow 1pm", timed("Lunch with Ana", "2026-11-15T12:00", "2026-11-15T13:00")],
    ["Dinner at Noma tomorrow 8pm", timed("Dinner at Noma", "2026-11-15T19:00", "2026-11-15T20:00")],
    ["Lunch with Ana, tomorrow at 1 pm", timed("Lunch with Ana", "2026-11-15T12:00", "2026-11-15T13:00")],
    ["LUNCH TMRW 1PM", timed("LUNCH", "2026-11-15T12:00", "2026-11-15T13:00")],
    ["Standup today 9:30", timed("Standup", "2026-11-14T08:30", "2026-11-14T09:30")],
    ["Shift 17:30", timed("Shift", "2026-11-14T16:30", "2026-11-14T17:30")],
    ["Shift 07:00", timed("Shift", "2026-11-14T06:00", "2026-11-14T07:00")],
    ["Call at 3", timed("Call", "2026-11-14T14:00", "2026-11-14T15:00")],
    ["Call at 10", timed("Call", "2026-11-14T09:00", "2026-11-14T10:00")],
    ["Lunch noon", timed("Lunch", "2026-11-14T11:00", "2026-11-14T12:00")],
    ["Deploy midnight", timed("Deploy", "2026-11-13T23:00", "2026-11-14T00:00")],
    ["Party tonight", timed("Party", "2026-11-14T18:00", "2026-11-14T19:00")],
    ["Party tonight at 9", timed("Party", "2026-11-14T20:00", "2026-11-14T21:00")],
    ["Review monday 10am", timed("Review", "2026-11-16T09:00", "2026-11-16T10:00")],
    ["Review on Tues 10am", timed("Review", "2026-11-17T09:00", "2026-11-17T10:00")],
    ["Ping in 30 min", timed("Ping", "2026-11-14T10:30", "2026-11-14T11:30")],
    ["Ping in 2 hrs for 15 minutes", timed("Ping", "2026-11-14T12:00", "2026-11-14T12:15")],
    ["Meeting 5-6pm", timed("Meeting", "2026-11-14T16:00", "2026-11-14T17:00")],
    ["Meeting 5pm-6pm", timed("Meeting", "2026-11-14T16:00", "2026-11-14T17:00")],
    ["Meeting 11-1pm", timed("Meeting", "2026-11-14T10:00", "2026-11-14T12:00")],
    ["Shift 17:00–18:30", timed("Shift", "2026-11-14T16:00", "2026-11-14T17:30")],
    ["Workshop from 9 to 11", timed("Workshop", "2026-11-14T08:00", "2026-11-14T10:00")],
    ["Workshop from 7 to 9", timed("Workshop", "2026-11-14T18:00", "2026-11-14T20:00")],
    ["Late show 11pm-1am", timed("Late show", "2026-11-14T22:00", "2026-11-15T00:00")],
    ["Hike tomorrow 9am for 1.5 hours", timed("Hike", "2026-11-15T08:00", "2026-11-15T09:30")],
    ["Focus 10am for 90m", timed("Focus", "2026-11-14T09:00", "2026-11-14T10:30")],
    ["Focus 10am for 1h", timed("Focus", "2026-11-14T09:00", "2026-11-14T10:00")],
    ["Brunch saturday", allDay("Brunch", "2026-11-14", "2026-11-13")],
    ["Brunch this sat", allDay("Brunch", "2026-11-14", "2026-11-13")],
    ["Brunch next saturday", allDay("Brunch", "2026-11-21", "2026-11-20")],
    ["Retro in 3 days", allDay("Retro", "2026-11-17", "2026-11-16")],
    ["Retro in 2 weeks", allDay("Retro", "2026-11-28", "2026-11-27")],
    ["Launch 2026-12-01", allDay("Launch", "2026-12-01", "2026-11-30")],
    ["Trip 18 nov", allDay("Trip", "2026-11-18", "2026-11-17")],
    ["Trip Nov 18th, 2027", allDay("Trip", "2027-11-18", "2027-11-17")],
    ["Trip 3rd of march", allDay("Trip", "2027-03-03", "2027-03-02")],
    ["Trip march 3", allDay("Trip", "2027-03-03", "2027-03-02")],
    ["Hike tomorrow for 2 hours", allDay("Hike", "2026-11-15", "2026-11-14")],
    ["Offsite friday all day", allDay("Offsite", "2026-11-20", "2026-11-19")],
    ["Offsite all-day friday 9am", allDay("Offsite", "2026-11-20", "2026-11-19")],
  ])("%s", (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it.each([
    "Lunch with Ana",
    "Buy 3 apples",
    "Meeting 10-11",
    "Plan 1/2",
    "Trip 31 feb",
    "Note re: https://x.test",
    "",
  ])("finds nothing in %j", (input) => {
    expect(parseQuickAdd(input, options)).toBeNull();
  });

  it("leaves an empty title when the text is only a date and time", () => {
    expect(parse("tomorrow 1pm")?.title).toBe("");
  });

  it("never throws and never ends before it starts", () => {
    const words = fc.constantFrom(
      "lunch", "at", "on", "from", "to", "for", "-", "–", "tonight", "tomorrow",
      "next", "fri", "may", "3rd", "of", "12", "7", "5pm", "17:45", "2026-02-29",
      "in", "2", "hours", "days", "1.5", "h", "all", "day", "noon", ",",
    );
    fc.assert(
      fc.property(fc.array(fc.oneof(words, fc.string()), { maxLength: 8 }), (parts) => {
        const result = parseQuickAdd(parts.join(" "), options);
        if (result) expect(result.end.getTime()).toBeGreaterThan(result.start.getTime());
      }),
    );
  });

  it("zones a New York morning on the day DST starts", () => {
    const result = parseQuickAdd("Flight tomorrow 9am", {
      now: new Date("2026-03-07T17:00:00.000Z"),
      timezone: "America/New_York",
      defaultDurationMinutes: 30,
    });
    expect(result?.start.toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(result?.end.toISOString()).toBe("2026-03-08T13:30:00.000Z");
  });
});

describe("formatQuickAddSummary", () => {
  const summary = (input: string, timeFormat: "12h" | "24h" = "24h") => {
    const result = parseQuickAdd(input, options);
    return result ? formatQuickAddSummary(result, options.timezone, timeFormat) : null;
  };

  it("labels timed, all-day and overnight results", () => {
    expect(summary("Lunch tuesday 1pm")).toBe("Tue 17 Nov · 13:00–14:00");
    expect(summary("Lunch tuesday 1pm", "12h")).toBe("Tue 17 Nov · 1:00 PM–2:00 PM");
    expect(summary("Offsite tuesday")).toBe("Tue 17 Nov · All day");
    expect(summary("Late show 11pm-1am")).toBe("Sat 14 Nov · 23:00–Sun 15 Nov 01:00");
  });
});
