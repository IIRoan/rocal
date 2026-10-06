import { describe, expect, it } from "@jest/globals";
import { RecurrenceEngine } from "./recurrence";

describe("RecurrenceEngine", () => {
  it("preserves the event wall-clock time across DST changes", () => {
    const recurrence = RecurrenceEngine.createRecurrenceRule({
      frequency: "weekly",
      interval: 1,
      timezone: "America/New_York",
    });
    const instances = RecurrenceEngine.generateInstances(
      {
        id: "event",
        start: new Date("2026-03-01T13:00:00.000Z"),
        end: new Date("2026-03-01T14:00:00.000Z"),
        recurrence,
      },
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-03-09T00:00:00.000Z"),
    );

    expect(instances.map(({ date }) => date.toISOString())).toEqual([
      "2026-03-01T13:00:00.000Z",
      "2026-03-08T12:00:00.000Z",
    ]);
  });

  it("matches exceptions by the recurrence timezone's calendar day", () => {
    const recurrence = RecurrenceEngine.createRecurrenceRule({
      frequency: "daily",
      interval: 1,
      timezone: "Asia/Tokyo",
    });
    const instances = RecurrenceEngine.generateInstances(
      {
        id: "event",
        start: new Date("2026-03-01T15:30:00.000Z"),
        end: new Date("2026-03-01T16:30:00.000Z"),
        recurrence,
      },
      new Date("2026-03-01T00:00:00.000Z"),
      new Date("2026-03-03T00:00:00.000Z"),
      [{ exceptionDate: new Date("2026-03-03T02:00:00.000Z"), type: "modified" }],
    );

    expect(instances.map(({ date }) => date.toISOString())).toEqual([
      "2026-03-01T15:30:00.000Z",
    ]);
  });
});
