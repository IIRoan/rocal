import { describe, expect, it } from "@jest/globals";

import {
  buildRecurringEventCreateData,
  buildRecurringEventUpdateData,
} from "../../lib/recurring-series";

function seriesFixture(overrides: Record<string, unknown> = {}) {
  return {
    title: "",
    description: null,
    location: null,
    encryptedContent: "series-ciphertext",
    blindIndexTokens: JSON.stringify(["idx-series"]),
    encryptionState: "encrypted",
    encryptionKeyVersion: 1,
    allDay: false,
    color: null,
    reminder: null,
    recurrence: "FREQ=WEEKLY",
    calendarId: "calendar-1",
    categoryId: null,
    start: new Date("2026-06-01T09:00:00.000Z"),
    end: new Date("2026-06-01T10:00:00.000Z"),
    ...overrides,
  };
}

describe("recurring series content encryption", () => {
  it("keeps the series ciphertext on time-only occurrence edits", () => {
    const data = buildRecurringEventCreateData({
      existingEvent: seriesFixture(),
      updates: {
        start: "2026-06-08T11:00:00.000Z",
        end: "2026-06-08T12:00:00.000Z",
      },
      userId: "user-1",
      parentEventId: "event-1",
      recurrence: null,
      occurrenceDate: new Date("2026-06-08T09:00:00.000Z"),
    });

    expect(data).toEqual(
      expect.objectContaining({
        title: "",
        description: null,
        location: null,
        encryptedContent: "series-ciphertext",
        blindIndexTokens: JSON.stringify(["idx-series"]),
        encryptionState: "encrypted",
      }),
    );
  });

  it("stores new ciphertext without plaintext for content edits", () => {
    const data = buildRecurringEventCreateData({
      existingEvent: seriesFixture(),
      updates: {
        encryptedContent: "occurrence-ciphertext",
        blindIndexTokens: ["idx-occurrence"],
      },
      userId: "user-1",
      parentEventId: "event-1",
      recurrence: null,
    });

    expect(data).toEqual(
      expect.objectContaining({
        title: "",
        description: null,
        location: null,
        encryptedContent: "occurrence-ciphertext",
        blindIndexTokens: JSON.stringify(["idx-occurrence"]),
        encryptionState: "encrypted",
      }),
    );
  });

  it("rejects plaintext content edits on encrypted series", () => {
    expect(() =>
      buildRecurringEventUpdateData(seriesFixture(), { title: "Therapy" }),
    ).toThrow(
      "Encrypted content payload is required when updating protected event fields.",
    );
  });

  it("leaves content columns untouched for schedule-only series edits", () => {
    const data = buildRecurringEventUpdateData(seriesFixture(), {
      color: "blue",
    });

    expect(data).not.toHaveProperty("title");
    expect(data).not.toHaveProperty("encryptedContent");
    expect(data).toEqual(expect.objectContaining({ color: "blue" }));
  });
});
