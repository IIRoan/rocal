import {
  groupEventsIntoSections,
  formatAgendaDate,
  formatEventTime,
} from "./agenda-utils";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";


function makeEvent(
  id: string,
  start: Date,
  end: Date,
  overrides?: Partial<DecoratedCalendarEvent>,
): DecoratedCalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    start,
    end,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DecoratedCalendarEvent;
}


describe("formatAgendaDate", () => {
  it('returns "Today" for today\'s date', () => {
    expect(formatAgendaDate(new Date())).toBe("Today");
  });

  it('returns "Tomorrow" for tomorrow\'s date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatAgendaDate(tomorrow)).toBe("Tomorrow");
  });

  it("returns a formatted date string for other dates", () => {

    const date = new Date(2025, 0, 15);
    const result = formatAgendaDate(date);
    expect(result).toBe("Wednesday, Jan 15");
  });

  it("includes the full day name for non-today/tomorrow dates", () => {
    const date = new Date(2025, 5, 20);
    expect(formatAgendaDate(date)).toBe("Friday, Jun 20");
  });
});


describe("formatEventTime", () => {
  it('returns "All day" for all-day events', () => {
    const event = makeEvent(
      "1",
      new Date(2025, 0, 15, 0, 0),
      new Date(2025, 0, 16, 0, 0),
      { allDay: true },
    );
    expect(formatEventTime(event, "12h")).toBe("All day");
    expect(formatEventTime(event, "24h")).toBe("All day");
  });

  it("formats time range in 12h format", () => {
    const event = makeEvent(
      "2",
      new Date(2025, 0, 15, 9, 0),
      new Date(2025, 0, 15, 10, 0),
    );
    expect(formatEventTime(event, "12h")).toBe("9:00 AM – 10:00 AM");
  });

  it("formats time range in 24h format", () => {
    const event = makeEvent(
      "3",
      new Date(2025, 0, 15, 9, 0),
      new Date(2025, 0, 15, 10, 0),
    );
    expect(formatEventTime(event, "24h")).toBe("09:00 – 10:00");
  });

  it("formats afternoon times in 12h format", () => {
    const event = makeEvent(
      "4",
      new Date(2025, 0, 15, 14, 30),
      new Date(2025, 0, 15, 16, 0),
    );
    expect(formatEventTime(event, "12h")).toBe("2:30 PM – 4:00 PM");
  });

  it("formats afternoon times in 24h format", () => {
    const event = makeEvent(
      "5",
      new Date(2025, 0, 15, 14, 30),
      new Date(2025, 0, 15, 16, 0),
    );
    expect(formatEventTime(event, "24h")).toBe("14:30 – 16:00");
  });

  it("defaults to 12h format when no format is specified", () => {
    const event = makeEvent(
      "6",
      new Date(2025, 0, 15, 9, 0),
      new Date(2025, 0, 15, 10, 0),
    );
    expect(formatEventTime(event)).toBe("9:00 AM – 10:00 AM");
  });
});


describe("groupEventsIntoSections", () => {
  it("returns an empty array for no events", () => {
    expect(groupEventsIntoSections([])).toEqual([]);
  });

  it("groups events by date into sections", () => {
    const events = [
      makeEvent("1", new Date(2025, 0, 15, 10), new Date(2025, 0, 15, 11)),
      makeEvent("2", new Date(2025, 0, 15, 14), new Date(2025, 0, 15, 15)),
      makeEvent("3", new Date(2025, 0, 16, 9), new Date(2025, 0, 16, 10)),
    ];
    const sections = groupEventsIntoSections(events);

    expect(sections).toHaveLength(2);
    expect(sections[0].data).toHaveLength(2);
    expect(sections[1].data).toHaveLength(1);
  });

  it("sorts sections by date ascending", () => {
    const events = [
      makeEvent("1", new Date(2025, 0, 17, 10), new Date(2025, 0, 17, 11)),
      makeEvent("2", new Date(2025, 0, 15, 10), new Date(2025, 0, 15, 11)),
      makeEvent("3", new Date(2025, 0, 16, 10), new Date(2025, 0, 16, 11)),
    ];
    const sections = groupEventsIntoSections(events);

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe("Wednesday, Jan 15");
    expect(sections[1].title).toBe("Thursday, Jan 16");
    expect(sections[2].title).toBe("Friday, Jan 17");
  });

  it("sorts events within a section by start time", () => {
    const events = [
      makeEvent("late", new Date(2025, 0, 15, 16), new Date(2025, 0, 15, 17)),
      makeEvent("early", new Date(2025, 0, 15, 8), new Date(2025, 0, 15, 9)),
      makeEvent("mid", new Date(2025, 0, 15, 12), new Date(2025, 0, 15, 13)),
    ];
    const sections = groupEventsIntoSections(events);

    expect(sections[0].data[0].id).toBe("early");
    expect(sections[0].data[1].id).toBe("mid");
    expect(sections[0].data[2].id).toBe("late");
  });

  it("places all-day events before timed events within a section", () => {
    const events = [
      makeEvent("timed", new Date(2025, 0, 15, 9), new Date(2025, 0, 15, 10)),
      makeEvent("allday", new Date(2025, 0, 15, 0), new Date(2025, 0, 16, 0), {
        allDay: true,
      }),
    ];
    const sections = groupEventsIntoSections(events);

    expect(sections[0].data[0].id).toBe("allday");
    expect(sections[0].data[1].id).toBe("timed");
  });

  it("handles a single event", () => {
    const events = [
      makeEvent("1", new Date(2025, 0, 15, 10), new Date(2025, 0, 15, 11)),
    ];
    const sections = groupEventsIntoSections(events);

    expect(sections).toHaveLength(1);
    expect(sections[0].data).toHaveLength(1);
    expect(sections[0].data[0].id).toBe("1");
  });

  it("uses formatAgendaDate for section titles", () => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(11, 0, 0, 0);

    const events = [makeEvent("1", today, todayEnd)];
    const sections = groupEventsIntoSections(events);

    expect(sections[0].title).toBe("Today");
  });
});

describe("timezone-aware agenda UX", () => {
  const timezone = "Europe/Amsterdam";

  it("formats event times for display in the configured timezone", () => {
    const event = makeEvent(
      "zoned",
      new Date("2026-06-16T07:30:00.000Z"),
      new Date("2026-06-16T08:30:00.000Z"),
    );

    expect(formatEventTime(event, "24h", timezone)).toBe("09:30 – 10:30");
    expect(formatEventTime(event, "12h", timezone)).toBe("9:30 AM – 10:30 AM");
  });

  it("uses the event timezone when no viewer timezone is passed", () => {
    const event = makeEvent(
      "event-tz",
      new Date("2026-06-16T13:30:00.000Z"),
      new Date("2026-06-16T14:30:00.000Z"),
      { timezone: "America/New_York" },
    );

    expect(formatEventTime(event, "24h")).toBe("09:30 – 10:30");
  });

  it("groups late-night UTC events into the next zoned agenda section", () => {
    const events = [
      makeEvent(
        "late",
        new Date("2026-06-16T22:30:00.000Z"),
        new Date("2026-06-16T23:30:00.000Z"),
      ),
      makeEvent(
        "daytime",
        new Date("2026-06-16T10:00:00.000Z"),
        new Date("2026-06-16T11:00:00.000Z"),
      ),
    ];

    const sections = groupEventsIntoSections(events, timezone);

    expect(sections).toHaveLength(2);
    expect(sections[0]?.data[0]?.id).toBe("daytime");
    expect(sections[1]?.data[0]?.id).toBe("late");
    expect(sections[1]?.title).toBe("Wednesday, Jun 17");
  });

  it("labels today and tomorrow using the configured timezone", () => {
    const today = new Date();
    const { year, month, day } = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };
    const tomorrow = new Date(year, month - 1, day + 1);

    expect(formatAgendaDate(today, timezone)).toBe("Today");
    expect(formatAgendaDate(tomorrow, timezone)).toBe("Tomorrow");
  });
});


