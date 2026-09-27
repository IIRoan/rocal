import { describe, expect, it } from "@jest/globals";
import { differenceInCalendarDays } from "date-fns";

import {
  buildAgendaSections,
  getAgendaLastDay,
  getAgendaPageDate,
  getMonthGridDays,
  getMonthGridWeeks,
  getWeekdayLabels,
  groupEventsByCalendarDay,
  sortCalendarDayEvents,
} from "../calendar-view-days";
import {
  formatCalendarDayKey,
  pickerDateToAllDayUtcRange,
  wallClockToUtc,
} from "../timezone";

const AMSTERDAM = "Europe/Amsterdam";
const NEW_YORK = "America/New_York";

type TestEvent = {
  id: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  timezone?: string | null;
};

function timed(
  id: string,
  day: Date,
  [startHour, startMinute]: [number, number],
  endDay: Date,
  [endHour, endMinute]: [number, number],
  timezone = AMSTERDAM,
): TestEvent {
  return {
    id,
    start: wallClockToUtc(day, startHour, startMinute, timezone),
    end: wallClockToUtc(endDay, endHour, endMinute, timezone),
  };
}

function allDay(
  id: string,
  firstDay: Date,
  lastDay: Date,
  timezone: string = AMSTERDAM,
): TestEvent {
  const { start, end } = pickerDateToAllDayUtcRange(firstDay, lastDay, timezone);
  return { id, start, end, allDay: true, timezone };
}

function keysOf(map: Map<string, TestEvent[]>): Record<string, string[]> {
  return Object.fromEntries(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, events]) => [key, events.map((event) => event.id)]),
  );
}

describe("getMonthGridDays", () => {
  it("covers whole weeks from the Monday before the 1st when weeks start on Monday", () => {
    const days = getMonthGridDays(new Date(2026, 1, 14), 1);

    expect(days).toHaveLength(35);
    expect(formatCalendarDayKey(days[0]!)).toBe("2026-01-26");
    expect(formatCalendarDayKey(days[days.length - 1]!)).toBe("2026-03-01");
    expect(days[0]!.getDay()).toBe(1);
  });

  it("renders a four-week February when it starts on the week-start day", () => {
    const days = getMonthGridDays(new Date(2026, 1, 1), 0);

    expect(days).toHaveLength(28);
    expect(formatCalendarDayKey(days[0]!)).toBe("2026-02-01");
    expect(formatCalendarDayKey(days[27]!)).toBe("2026-02-28");
  });

  it("pads to six weeks when fixed weeks are requested", () => {
    const days = getMonthGridDays(new Date(2026, 1, 1), 0, {
      fixedWeeks: true,
    });

    expect(days).toHaveLength(42);
    expect(formatCalendarDayKey(days[41]!)).toBe("2026-03-14");
  });

  it("honors a Saturday week start and normalizes out-of-range values", () => {
    expect(getMonthGridDays(new Date(2026, 4, 1), 6)[0]!.getDay()).toBe(6);
    expect(getMonthGridDays(new Date(2026, 4, 1), -1)[0]!.getDay()).toBe(6);
    expect(getMonthGridDays(new Date(2026, 4, 1), 8)[0]!.getDay()).toBe(1);
  });

  it.each([
    ["March (spring forward)", new Date(2026, 2, 1)],
    ["October (fall back)", new Date(2026, 9, 1)],
    ["November (US fall back)", new Date(2026, 10, 1)],
  ])("keeps consecutive midnight days across DST in %s", (_label, month) => {
    const days = getMonthGridDays(month, 1);

    for (let index = 0; index < days.length; index++) {
      const day = days[index]!;
      expect(day.getHours()).toBe(0);
      if (index > 0) {
        expect(differenceInCalendarDays(day, days[index - 1]!)).toBe(1);
      }
    }
    expect(new Set(days.map(formatCalendarDayKey)).size).toBe(days.length);
  });

  it("groups the grid into rows of seven", () => {
    const weeks = getMonthGridWeeks(new Date(2026, 7, 1), 1);

    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks.every((week) => week[0]!.getDay() === 1)).toBe(true);
  });
});

describe("getWeekdayLabels", () => {
  it("orders labels from the configured week start", () => {
    expect(getWeekdayLabels(1)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(getWeekdayLabels(0)[0]).toBe("Sun");
    expect(getWeekdayLabels(6, "EEEEE")).toEqual([
      "S",
      "S",
      "M",
      "T",
      "W",
      "T",
      "F",
    ]);
  });
});

describe("groupEventsByCalendarDay", () => {
  const march = {
    firstDay: new Date(2026, 2, 1),
    lastDay: new Date(2026, 2, 31),
  };

  it("keys timed events by the day in the user's timezone", () => {
    const event: TestEvent = {
      id: "late",
      start: new Date("2026-03-10T23:30:00.000Z"),
      end: new Date("2026-03-11T00:15:00.000Z"),
    };

    expect(keysOf(groupEventsByCalendarDay([event], march, AMSTERDAM))).toEqual({
      "2026-03-11": ["late"],
    });
    expect(keysOf(groupEventsByCalendarDay([event], march, NEW_YORK))).toEqual({
      "2026-03-10": ["late"],
    });
  });

  it("places an overnight event across the DST switch on both days", () => {
    const event = timed(
      "overnight",
      new Date(2026, 2, 28),
      [22, 0],
      new Date(2026, 2, 29),
      [10, 0],
    );

    expect(keysOf(groupEventsByCalendarDay([event], march, AMSTERDAM))).toEqual({
      "2026-03-28": ["overnight"],
      "2026-03-29": ["overnight"],
    });
  });

  it("does not spill a timed event that ends exactly at midnight into the next day", () => {
    const event = timed(
      "evening",
      new Date(2026, 2, 5),
      [20, 0],
      new Date(2026, 2, 6),
      [0, 0],
    );

    expect(keysOf(groupEventsByCalendarDay([event], march, AMSTERDAM))).toEqual({
      "2026-03-05": ["evening"],
    });
  });

  it("repeats multi-day events on every covered day", () => {
    const event = timed(
      "trip",
      new Date(2026, 2, 9),
      [10, 0],
      new Date(2026, 2, 11),
      [12, 0],
    );

    expect(keysOf(groupEventsByCalendarDay([event], march, AMSTERDAM))).toEqual({
      "2026-03-09": ["trip"],
      "2026-03-10": ["trip"],
      "2026-03-11": ["trip"],
    });
  });

  it("keeps all-day events on their saved dates for viewers in other timezones", () => {
    const event = allDay(
      "holiday",
      new Date(2026, 2, 10),
      new Date(2026, 2, 10),
      "Asia/Tokyo",
    );

    expect(
      keysOf(groupEventsByCalendarDay([event], march, "America/Los_Angeles")),
    ).toEqual({ "2026-03-10": ["holiday"] });
  });

  it("treats an exclusive UTC-midnight end as the day before", () => {
    const event: TestEvent = {
      id: "conference",
      start: new Date("2026-03-10T00:00:00.000Z"),
      end: new Date("2026-03-12T00:00:00.000Z"),
      allDay: true,
    };

    expect(keysOf(groupEventsByCalendarDay([event], march, NEW_YORK))).toEqual({
      "2026-03-10": ["conference"],
      "2026-03-11": ["conference"],
    });
  });

  it("clamps long events to the requested span", () => {
    const event = allDay("season", new Date(2026, 0, 1), new Date(2026, 11, 31));
    const map = groupEventsByCalendarDay([event], march, AMSTERDAM);

    expect(map.size).toBe(31);
    expect(map.has("2026-02-28")).toBe(false);
    expect(map.has("2026-04-01")).toBe(false);
  });

  it("skips events with invalid instants", () => {
    const broken: TestEvent = {
      id: "broken",
      start: new Date("not a date"),
      end: new Date("not a date"),
    };

    expect(groupEventsByCalendarDay([broken], march, AMSTERDAM).size).toBe(0);
  });

  it("sorts all-day and multi-day events before timed ones, then by start", () => {
    const day = new Date(2026, 2, 12);
    const late = timed("late", day, [18, 0], day, [19, 0]);
    const early = timed("early", day, [8, 0], day, [9, 0]);
    const spanning = timed("spanning", day, [17, 0], new Date(2026, 2, 13), [9, 0]);
    const holiday = allDay("holiday", day, day);

    expect(
      groupEventsByCalendarDay([late, early, spanning, holiday], march, AMSTERDAM)
        .get("2026-03-12")
        ?.map((event) => event.id),
    ).toEqual(["holiday", "spanning", "early", "late"]);
  });
});

describe("sortCalendarDayEvents", () => {
  it("does not mutate its input", () => {
    const day = new Date(2026, 2, 12);
    const events = [
      timed("b", day, [10, 0], day, [11, 0]),
      timed("a", day, [9, 0], day, [10, 0]),
    ];

    sortCalendarDayEvents(events, AMSTERDAM);
    expect(events.map((event) => event.id)).toEqual(["b", "a"]);
  });
});

describe("buildAgendaSections", () => {
  const start = new Date(2026, 2, 10);

  it("lists only days with events, in order", () => {
    const sections = buildAgendaSections(
      [
        timed("later", new Date(2026, 2, 20), [9, 0], new Date(2026, 2, 20), [10, 0]),
        timed("first", new Date(2026, 2, 11), [9, 0], new Date(2026, 2, 11), [10, 0]),
      ],
      start,
      AMSTERDAM,
    );

    expect(sections.map((section) => section.key)).toEqual([
      "2026-03-11",
      "2026-03-20",
    ]);
    expect(sections[0]!.date.getDate()).toBe(11);
  });

  it("shows events that started before the page on its first day", () => {
    const sections = buildAgendaSections(
      [allDay("vacation", new Date(2026, 2, 8), new Date(2026, 2, 11))],
      start,
      AMSTERDAM,
    );

    expect(
      sections.map((section) => [section.key, section.data.map((e) => e.id)]),
    ).toEqual([
      ["2026-03-10", ["vacation"]],
      ["2026-03-11", ["vacation"]],
    ]);
  });

  it("excludes events past the last agenda day", () => {
    const outside = timed(
      "outside",
      new Date(2026, 3, 9),
      [9, 0],
      new Date(2026, 3, 9),
      [10, 0],
    );
    const inside = timed(
      "inside",
      new Date(2026, 3, 8),
      [9, 0],
      new Date(2026, 3, 8),
      [10, 0],
    );

    expect(
      buildAgendaSections([outside, inside], start, AMSTERDAM).map((s) => s.key),
    ).toEqual(["2026-04-08"]);
    expect(formatCalendarDayKey(getAgendaLastDay(start))).toBe("2026-04-08");
  });

  it("ignores the time component of the start date", () => {
    const morning = timed("morning", start, [7, 0], start, [8, 0]);

    expect(
      buildAgendaSections([morning], new Date(2026, 2, 10, 15, 45), AMSTERDAM)
        .map((s) => s.key),
    ).toEqual(["2026-03-10"]);
  });

  it("returns no sections for an empty range", () => {
    expect(buildAgendaSections([], start, AMSTERDAM)).toEqual([]);
    expect(
      buildAgendaSections(
        [timed("x", start, [9, 0], start, [10, 0])],
        start,
        AMSTERDAM,
        0,
      ),
    ).toEqual([]);
  });
});

describe("getAgendaPageDate", () => {
  it("pages by the number of agenda days", () => {
    const start = new Date(2026, 2, 10, 12);

    expect(formatCalendarDayKey(getAgendaPageDate(start, 1))).toBe("2026-04-09");
    expect(formatCalendarDayKey(getAgendaPageDate(start, -1))).toBe("2026-02-08");
    expect(getAgendaPageDate(start, 1).getHours()).toBe(0);
  });
});
