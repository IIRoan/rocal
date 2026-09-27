import {
  isRecurringSeriesMember,
  resolveRecurringEventTarget,
  shiftRecurringSeriesTimes,
  toRecurringEventUpdates,
} from "../recurring-event-target";

const start = new Date("2026-06-03T09:00:00.000Z");

describe("resolveRecurringEventTarget", () => {
  it("reads the parent id and original occurrence date from a generated instance id", () => {
    expect(
      resolveRecurringEventTarget({
        id: "series-1_2026-06-03T09:00:00.000Z",
        start: new Date("2026-06-04T12:00:00.000Z"),
        parentEventId: "series-1",
        isRecurringInstance: true,
      }),
    ).toEqual({
      parentEventId: "series-1",
      occurrenceDate: "2026-06-03T09:00:00.000Z",
      detachedEventId: null,
    });
  });

  it("falls back to the id prefix when the instance has no parentEventId", () => {
    expect(
      resolveRecurringEventTarget({
        id: "series-1_2026-06-03T09:00:00Z",
        start,
      })?.parentEventId,
    ).toBe("series-1");
  });

  it("targets the series itself for the first occurrence", () => {
    expect(
      resolveRecurringEventTarget({
        id: "series-1",
        start,
        recurrence: "FREQ=WEEKLY",
      }),
    ).toEqual({
      parentEventId: "series-1",
      occurrenceDate: "2026-06-03T09:00:00.000Z",
      detachedEventId: null,
    });
  });

  it("keeps the detached row id for an already edited occurrence", () => {
    expect(
      resolveRecurringEventTarget({
        id: "exception-1",
        start: new Date("2026-06-10T09:00:00.000Z"),
        parentEventId: "series-1",
      }),
    ).toEqual({
      parentEventId: "series-1",
      occurrenceDate: "2026-06-10T09:00:00.000Z",
      detachedEventId: "exception-1",
    });
  });

  it("returns null for single events", () => {
    expect(resolveRecurringEventTarget({ id: "event-1", start })).toBeNull();
    expect(resolveRecurringEventTarget(null)).toBeNull();
  });
});

describe("isRecurringSeriesMember", () => {
  it("matches the series, its instances and its detached exceptions only", () => {
    expect(isRecurringSeriesMember({ id: "series-1" }, "series-1")).toBe(true);
    expect(
      isRecurringSeriesMember(
        { id: "series-1_2026-06-03T09:00:00.000Z" },
        "series-1",
      ),
    ).toBe(true);
    expect(
      isRecurringSeriesMember(
        { id: "exception-1", parentEventId: "series-1" },
        "series-1",
      ),
    ).toBe(true);
    expect(isRecurringSeriesMember({ id: "series-10" }, "series-1")).toBe(
      false,
    );
  });
});

describe("toRecurringEventUpdates", () => {
  it("preserves supported attendee and timezone changes", () => {
    expect(
      toRecurringEventUpdates({
        title: "Standup",
        start: "2026-06-03T10:00:00.000Z",
        allDay: false,
        timezone: "Europe/Amsterdam",
        participants: [],
        reminder: null,
        recurrence: null,
        encryptedTitle: "ciphertext",
      }),
    ).toEqual({
      title: "Standup",
      start: "2026-06-03T10:00:00.000Z",
      allDay: false,
      timezone: "Europe/Amsterdam",
      participants: [],
    });
  });

  it("keeps numeric reminders and string recurrence rules", () => {
    expect(
      toRecurringEventUpdates({ reminder: 15, recurrence: "FREQ=DAILY" }),
    ).toEqual({ reminder: 15, recurrence: "FREQ=DAILY" });
  });
});

describe("shiftRecurringSeriesTimes", () => {
  it("preserves wall-clock time when a move crosses DST", () => {
    expect(
      shiftRecurringSeriesTimes({
        series: { start: "2026-02-01T09:00:00Z", end: "2026-02-01T10:00:00Z" },
        occurrence: {
          start: "2026-03-28T09:00:00Z",
          end: "2026-03-28T10:00:00Z",
        },
        next: { start: "2026-03-29T08:00:00Z", end: "2026-03-29T09:00:00Z" },
        timezone: "Europe/Amsterdam",
      }),
    ).toEqual({
      start: "2026-02-02T09:00:00.000Z",
      end: "2026-02-02T10:00:00.000Z",
    });
  });

  it("moves the series start by the occurrence delta instead of jumping to the occurrence", () => {
    expect(
      shiftRecurringSeriesTimes({
        series: {
          start: "2026-06-01T09:00:00.000Z",
          end: "2026-06-01T10:00:00.000Z",
        },
        occurrence: {
          start: "2026-06-08T09:00:00.000Z",
          end: "2026-06-08T10:00:00.000Z",
        },
        next: {
          start: "2026-06-08T11:30:00.000Z",
          end: "2026-06-08T12:30:00.000Z",
        },
      }),
    ).toEqual({
      start: "2026-06-01T11:30:00.000Z",
      end: "2026-06-01T12:30:00.000Z",
    });
  });

  it("omits unchanged times", () => {
    expect(
      shiftRecurringSeriesTimes({
        series: {
          start: "2026-06-01T09:00:00.000Z",
          end: "2026-06-01T10:00:00.000Z",
        },
        occurrence: {
          start: "2026-06-08T09:00:00.000Z",
          end: "2026-06-08T10:00:00.000Z",
        },
        next: {
          start: "2026-06-08T09:00:00.000Z",
          end: "2026-06-08T11:00:00.000Z",
        },
      }),
    ).toEqual({ end: "2026-06-01T11:00:00.000Z" });
  });
});
