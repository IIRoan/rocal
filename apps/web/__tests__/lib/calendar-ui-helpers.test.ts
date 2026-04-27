import { describe, expect, it } from "@jest/globals";

import {
  getErrorMessage,
  partitionCalendarsByKind,
} from "../../lib/calendar-ui-helpers";
import type { Calendar } from "../../lib/types/calendar";

function calendarFixture(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: "calendar-1",
    name: "Work",
    color: "blue",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: false,
    isSyncOnly: false,
    userId: "user-1",
    createdAt: new Date("2026-04-24T10:00:00.000Z"),
    updatedAt: new Date("2026-04-24T10:00:00.000Z"),
    ...overrides,
  };
}

describe("calendar-ui-helpers", () => {
  it("partitions owned, holiday, and subscribed calendars deterministically", () => {
    const result = partitionCalendarsByKind([
      calendarFixture({ id: "owned-1", kind: "owned" }),
      calendarFixture({ id: "holiday-1", kind: "public_holiday" }),
      calendarFixture({ id: "sub-1", kind: "subscribed", isSyncOnly: true }),
      calendarFixture({ id: "owned-2", kind: "owned" }),
    ]);

    expect(result.ownedCalendars.map((calendar) => calendar.id)).toEqual([
      "owned-1",
      "owned-2",
    ]);
    expect(result.publicCalendars.map((calendar) => calendar.id)).toEqual([
      "holiday-1",
    ]);
    expect(result.subscribedCalendars.map((calendar) => calendar.id)).toEqual([
      "sub-1",
    ]);
  });

  it("extracts string error messages and falls back otherwise", () => {
    expect(getErrorMessage(new Error("Request failed"), "Fallback")).toBe(
      "Request failed",
    );
    expect(getErrorMessage({ message: "  Trimmed error  " }, "Fallback")).toBe(
      "  Trimmed error  ",
    );
    expect(getErrorMessage({ message: "   " }, "Fallback")).toBe(
      "Fallback",
    );
    expect(getErrorMessage(null, "Fallback")).toBe("Fallback");
  });
});