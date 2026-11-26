import { describe, expect, it } from "@jest/globals";

import { mailListDayLabel } from "../mail-list-day-groups";

describe("mailListDayLabel", () => {
  // Thursday 26 November 2026, 13:00 in Amsterdam.
  const now = new Date("2026-11-26T12:00:00.000Z");
  const label = (receivedAt: string | undefined, weekStartDay = 1) =>
    mailListDayLabel(receivedAt, now, "Europe/Amsterdam", weekStartDay);

  it("groups by the account's calendar day, not UTC", () => {
    expect(label("2026-11-26T08:15:00.000Z")).toBe("Today");
    expect(label("2026-11-25T23:30:00.000Z")).toBe("Today");
    expect(label("2026-11-25T20:00:00.000Z")).toBe("Yesterday");
  });

  it("names the rest of the week, the month, earlier months and earlier years", () => {
    expect(label("2026-11-23T09:00:00.000Z")).toBe("Earlier this week");
    expect(label("2026-11-22T22:30:00.000Z")).toBe("Earlier in November");
    expect(label("2026-11-22T22:30:00.000Z", 0)).toBe("Earlier this week");
    expect(label("2026-10-27T10:00:00.000Z")).toBe("October");
    expect(label("2025-12-01T10:00:00.000Z")).toBe("December 2025");
  });

  it("keeps messages without a usable date together", () => {
    expect(label(undefined)).toBe("Older");
    expect(label("not a date")).toBe("Older");
    expect(label("2026-11-27T09:00:00.000Z")).toBe("Today");
  });
});
