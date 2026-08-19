import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { wallClockToUtc } from "@workspace/calendar-core";
import {
  KIT_NUMBER_OF_DAYS,
  fromKitPageDate,
  kitBackgroundToCreateSlot,
  kitDropToEventMove,
  kitDropToVisibleDate,
  kitScrollByDay,
  parseKitVisibleDate,
  preserveDroppedEventDuration,
  resolveKitRecurrenceEdit,
  shouldCommitDragVisibleDate,
  shouldSyncTimelineDate,
  toKitEvent,
  toKitFirstDay,
  toKitHourFormat,
  toKitHourWidth,
  toKitInitialDate,
  toKitPageDate,
} from "./calendar-kit-adapter";

const TIMEZONE = "Europe/Amsterdam";

function makeEvent(
  overrides: Partial<DecoratedCalendarEvent> = {},
): DecoratedCalendarEvent {
  const start = overrides.start ?? wallClockToUtc(new Date(2026, 7, 18), 9, 0, TIMEZONE);
  const end = overrides.end ?? wallClockToUtc(new Date(2026, 7, 18), 10, 0, TIMEZONE);

  return {
    id: "evt-1",
    title: "Focus",
    start,
    end,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  } as DecoratedCalendarEvent;
}

describe("toKitFirstDay", () => {
  it("maps Sunday (0) to Luxon weekday 7", () => {
    expect(toKitFirstDay(0)).toBe(7);
  });

  it("maps Monday (1) to Luxon weekday 1", () => {
    expect(toKitFirstDay(1)).toBe(1);
  });

  it("maps Saturday (6) to Luxon weekday 6", () => {
    expect(toKitFirstDay(6)).toBe(6);
  });
});

describe("kit view mapping", () => {
  it("uses 1/3/7 columns for day, 3-day, and week", () => {
    expect(KIT_NUMBER_OF_DAYS.day).toBe(1);
    expect(KIT_NUMBER_OF_DAYS["3day"]).toBe(3);
    expect(KIT_NUMBER_OF_DAYS.week).toBe(7);
  });

  it("pages 3-day and week by the visible window, not one day", () => {
    expect(kitScrollByDay("day")).toBe(true);
    expect(kitScrollByDay("3day")).toBe(false);
    expect(kitScrollByDay("week")).toBe(false);
  });

  it("starts the 3-day kit window on yesterday so the grid is centered", () => {
    const selected = new Date(2026, 7, 18);

    expect(toKitInitialDate(toKitPageDate("3day", selected))).toBe(
      "2026-08-17",
    );
    expect(toKitInitialDate(fromKitPageDate("3day", new Date(2026, 7, 17)))).toBe(
      "2026-08-18",
    );
    expect(toKitInitialDate(toKitPageDate("day", selected))).toBe("2026-08-18");
    expect(toKitInitialDate(toKitPageDate("week", selected))).toBe(
      "2026-08-18",
    );
  });
});

describe("toKitHourFormat", () => {
  it("matches the web week gutter in 12-hour mode", () => {
    expect(toKitHourFormat("12h")).toBe("h a");
  });

  it("uses HH:mm for 24-hour labels like 08:00", () => {
    expect(toKitHourFormat("24h")).toBe("HH:mm");
  });
});

describe("toKitHourWidth", () => {
  it("leaves room for 24-hour HH:mm labels after the hour tick", () => {
    expect(toKitHourWidth("24h")).toBe(52);
  });

  it("leaves room for 12-hour meridiem labels", () => {
    expect(toKitHourWidth("12h")).toBe(58);
  });
});

describe("toKitEvent", () => {
  it("keeps a timed Amsterdam 09:00 event as UTC ISO with the user timezone", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 9, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 18), 10, 0, TIMEZONE);
    const kit = toKitEvent(makeEvent({ start, end }), TIMEZONE);

    expect(kit.start).toEqual({
      dateTime: start.toISOString(),
      timeZone: TIMEZONE,
    });
    expect(kit.end).toEqual({
      dateTime: end.toISOString(),
      timeZone: TIMEZONE,
    });
    expect(
      toKitInitialDate(parseKitVisibleDate(start.toISOString(), TIMEZONE)),
    ).toBe("2026-08-18");
  });

  it("converts exclusive all-day midnight end to an inclusive kit date", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 0, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 19), 0, 0, TIMEZONE);
    const kit = toKitEvent(
      makeEvent({ start, end, allDay: true, title: "Holiday" }),
      TIMEZONE,
    );

    expect(kit.start).toEqual({ date: "2026-08-18" });
    expect(kit.end).toEqual({ date: "2026-08-18" });
  });

  it("keeps a multi-day all-day span inclusive on the last visible day", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 0, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 21), 0, 0, TIMEZONE);
    const kit = toKitEvent(
      makeEvent({ start, end, allDay: true, title: "Trip" }),
      TIMEZONE,
    );

    expect(kit.start).toEqual({ date: "2026-08-18" });
    expect(kit.end).toEqual({ date: "2026-08-20" });
  });

  it("puts timed events that cross a zoned calendar day on the all-day row", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 22, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 19), 2, 0, TIMEZONE);
    const kit = toKitEvent(makeEvent({ start, end }), TIMEZONE);

    expect(kit.start).toEqual({ date: "2026-08-18" });
    expect(kit.end).toEqual({ date: "2026-08-19" });
  });

  it("marks owned events as editable and attendee invites as not", () => {
    expect(toKitEvent(makeEvent(), TIMEZONE).editable).toBe(true);
    expect(toKitEvent(makeEvent(), TIMEZONE).encryptionState).toBeUndefined();
    expect(
      toKitEvent(
        makeEvent({ encryptionState: "encrypted", title: "Standup" }),
        TIMEZONE,
      ),
    ).toMatchObject({
      title: "Standup",
      encryptionState: "encrypted",
    });
    expect(
      toKitEvent(
        makeEvent({
          isSynced: true,
        }),
        TIMEZONE,
      ).editable,
    ).toBe(false);
    expect(
      toKitEvent(
        makeEvent({
          participants: [
            {
              id: "p-1",
              eventId: "evt-1",
              userId: "user-1",
              email: "me@example.com",
              role: "attendee",
              status: "accepted",
            },
          ],
        }),
        TIMEZONE,
      ).editable,
    ).toBe(false);
  });
});

describe("kitDropToEventMove", () => {
  it("returns UTC start and end for an editable timed drop", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 11, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 18), 12, 0, TIMEZONE);

    expect(
      kitDropToEventMove({
        id: "evt-1",
        editable: true,
        start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
      }),
    ).toEqual({
      eventId: "evt-1",
      start: start.toISOString(),
      end: end.toISOString(),
    });
  });

  it("ignores drops for events the user cannot edit", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 11, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 18), 12, 0, TIMEZONE);
    const dropped = {
      id: "evt-1",
      start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
    };

    expect(kitDropToEventMove({ ...dropped, editable: false })).toBeNull();
    expect(
      kitDropToEventMove(dropped, makeEvent({ isSynced: true })),
    ).toBeNull();
  });

  it("ignores all-day drops without dateTime", () => {
    expect(
      kitDropToEventMove({
        id: "evt-1",
        editable: true,
        start: { date: "2026-08-18" },
        end: { date: "2026-08-18" },
      }),
    ).toBeNull();
  });

  it("ignores a drop that did not change start or end", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 9, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 18), 10, 0, TIMEZONE);
    const event = makeEvent({ start, end });

    expect(
      kitDropToEventMove(
        {
          id: "evt-1",
          editable: true,
          start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
        },
        event,
      ),
    ).toBeNull();
  });

  it("keeps the original duration when dragged onto the next week", () => {
    const start = wallClockToUtc(new Date(2026, 7, 14), 9, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 14), 10, 30, TIMEZONE);
    const nextWeekStart = wallClockToUtc(new Date(2026, 7, 17), 14, 0, TIMEZONE);
    const driftedEnd = wallClockToUtc(new Date(2026, 7, 17), 16, 0, TIMEZONE);
    const expectedEnd = wallClockToUtc(new Date(2026, 7, 17), 15, 30, TIMEZONE);

    expect(
      kitDropToEventMove(
        {
          id: "evt-1",
          editable: true,
          start: {
            dateTime: nextWeekStart.toISOString(),
            timeZone: TIMEZONE,
          },
          end: { dateTime: driftedEnd.toISOString(), timeZone: TIMEZONE },
        },
        makeEvent({ start, end }),
      ),
    ).toEqual({
      eventId: "evt-1",
      start: nextWeekStart.toISOString(),
      end: expectedEnd.toISOString(),
    });
  });

  it("keeps duration when a 3-day window pages onto the following days", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 16, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 18), 17, 0, TIMEZONE);
    const pagedStart = wallClockToUtc(new Date(2026, 7, 21), 9, 15, TIMEZONE);

    const move = kitDropToEventMove(
      {
        id: "evt-1",
        start: { dateTime: pagedStart.toISOString(), timeZone: TIMEZONE },
        end: {
          dateTime: wallClockToUtc(
            new Date(2026, 7, 21),
            11,
            0,
            TIMEZONE,
          ).toISOString(),
          timeZone: TIMEZONE,
        },
      },
      makeEvent({ start, end }),
    );

    expect(move?.start).toBe(pagedStart.toISOString());
    expect(
      new Date(move!.end).getTime() - new Date(move!.start).getTime(),
    ).toBe(end.getTime() - start.getTime());
  });

  it("scopes a non-original occurrence move to this_only", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 11, 0, TIMEZONE);
    const end = wallClockToUtc(new Date(2026, 7, 18), 12, 0, TIMEZONE);
    const occurrenceDate = "2026-08-19T09:00:00.000Z";
    const event = makeEvent({
      id: `parent-1_${occurrenceDate}`,
      parentEventId: "parent-1",
      isRecurringInstance: true,
      start: new Date(occurrenceDate),
      end: new Date("2026-08-19T10:00:00.000Z"),
    });

    expect(
      kitDropToEventMove(
        {
          id: event.id,
          editable: true,
          start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
          end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
        },
        event,
      ),
    ).toEqual({
      eventId: event.id,
      start: start.toISOString(),
      end: end.toISOString(),
      recurrenceEdit: {
        parentEventId: "parent-1",
        occurrenceDate,
      },
    });
  });
});

describe("resolveKitRecurrenceEdit", () => {
  it("parses parentId_ISODate instance ids", () => {
    const occurrenceDate = "2026-05-19T09:00:00.000Z";

    expect(
      resolveKitRecurrenceEdit(
        makeEvent({
          id: `evt-series_${occurrenceDate}`,
          isRecurringInstance: true,
        }),
      ),
    ).toEqual({
      parentEventId: "evt-series",
      occurrenceDate,
    });
  });

  it("does not treat a non-recurring event as an occurrence edit", () => {
    expect(resolveKitRecurrenceEdit(makeEvent())).toBeNull();
  });
});

describe("week-cross drag date sync", () => {
  it("does not sync the visible date while a drag is in progress", () => {
    expect(shouldSyncTimelineDate(true)).toBe(false);
    expect(shouldSyncTimelineDate(false)).toBe(true);
  });

  it("commits the destination day after a drop onto the next week", () => {
    const destination = parseKitVisibleDate(
      wallClockToUtc(new Date(2026, 7, 17), 14, 0, TIMEZONE).toISOString(),
      TIMEZONE,
    );

    expect(toKitInitialDate(destination)).toBe("2026-08-17");
    expect(shouldCommitDragVisibleDate(destination, "2026-08-14")).toBe(true);
    expect(shouldCommitDragVisibleDate(destination, "2026-08-17")).toBe(false);
  });

  it("reads the destination calendar day from a timed drop", () => {
    const start = wallClockToUtc(new Date(2026, 7, 17), 14, 0, TIMEZONE);
    const date = kitDropToVisibleDate(
      {
        id: "evt-1",
        start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
        end: {
          dateTime: wallClockToUtc(
            new Date(2026, 7, 17),
            15,
            0,
            TIMEZONE,
          ).toISOString(),
          timeZone: TIMEZONE,
        },
      },
      TIMEZONE,
    );

    expect(date && toKitInitialDate(date)).toBe("2026-08-17");
  });

  it("preserves a 90-minute duration across a week boundary", () => {
    const originalStart = wallClockToUtc(new Date(2026, 7, 14), 9, 0, TIMEZONE);
    const originalEnd = wallClockToUtc(new Date(2026, 7, 14), 10, 30, TIMEZONE);
    const nextWeekStart = wallClockToUtc(new Date(2026, 7, 17), 11, 0, TIMEZONE);

    expect(
      preserveDroppedEventDuration(
        nextWeekStart.toISOString(),
        originalStart,
        originalEnd,
      ),
    ).toBe(wallClockToUtc(new Date(2026, 7, 17), 12, 30, TIMEZONE).toISOString());
  });
});

describe("kitBackgroundToCreateSlot", () => {
  it("uses the zoned hour from a timed background press, not device getHours", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 9, 0, TIMEZONE);
    expect(
      kitBackgroundToCreateSlot({ dateTime: start.toISOString() }, TIMEZONE),
    ).toEqual({ date: "2026-08-18", hour: "9" });
  });

  it("opens create at midnight for an all-day background press", () => {
    expect(
      kitBackgroundToCreateSlot({ date: "2026-08-18" }, TIMEZONE),
    ).toEqual({ date: "2026-08-18", hour: "0" });
  });
});

describe("parseKitVisibleDate", () => {
  it("parses YYYY-MM-DD as a picker calendar day", () => {
    const date = parseKitVisibleDate("2026-08-18", TIMEZONE);
    expect(toKitInitialDate(date)).toBe("2026-08-18");
  });

  it("converts a kit ISO callback into the user-timezone calendar day", () => {
    const start = wallClockToUtc(new Date(2026, 7, 18), 9, 0, TIMEZONE);
    const date = parseKitVisibleDate(start.toISOString(), TIMEZONE);
    expect(toKitInitialDate(date)).toBe("2026-08-18");
  });
});
