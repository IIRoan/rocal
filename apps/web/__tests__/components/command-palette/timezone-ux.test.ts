import { describe, expect, it } from "@jest/globals";

import { validateEventForm } from "@/components/command-palette/event-utils";
import { formatTimeForInput } from "@/components/command-palette/time-utils";
import { getEventDateDisplay } from "@/lib/event-editor-view-model";

describe("command palette timezone UX", () => {
  const timezone = "Europe/Amsterdam";

  it("formats event time inputs from the configured timezone, not device local time", () => {
    const instant = new Date("2026-06-16T22:30:00.000Z");

    expect(formatTimeForInput(instant, timezone)).toBe("00:30");
  });

  it("rejects timed events whose end wall clock is before the start wall clock", () => {
    const startDate = new Date(2026, 5, 16);
    const endDate = new Date(2026, 5, 16);

    expect(
      validateEventForm(
        "Planning",
        "calendar-1",
        startDate,
        endDate,
        false,
        "14:00",
        "13:00",
        timezone,
      ),
    ).toBe("End date cannot be before start date");
  });

  it("accepts timed events when start and end are valid in the configured timezone", () => {
    const startDate = new Date(2026, 5, 16);
    const endDate = new Date(2026, 5, 16);

    expect(
      validateEventForm(
        "Planning",
        "calendar-1",
        startDate,
        endDate,
        false,
        "09:00",
        "10:00",
        timezone,
      ),
    ).toBeNull();
  });

  it("validates all-day ranges using inclusive picker days in the configured timezone", () => {
    expect(
      validateEventForm(
        "Retreat",
        "calendar-1",
        new Date(2026, 5, 18),
        new Date(2026, 5, 16),
        true,
        "00:00",
        "00:00",
        timezone,
      ),
    ).toBe("End date cannot be before start date");

    expect(
      validateEventForm(
        "Retreat",
        "calendar-1",
        new Date(2026, 5, 16),
        new Date(2026, 5, 18),
        true,
        "00:00",
        "00:00",
        timezone,
      ),
    ).toBeNull();
  });
});

describe("event editor timezone display", () => {
  it("labels same-day events using the configured timezone", () => {
    expect(
      getEventDateDisplay(
        new Date("2026-06-16T07:00:00.000Z"),
        new Date("2026-06-16T08:00:00.000Z"),
        { timezone: "Europe/Amsterdam" },
      ),
    ).toEqual({
      isSameDay: true,
      label: "Tuesday, June 16, 2026",
    });
  });

  it("splits cross-midnight ranges into separate start and end labels", () => {
    expect(
      getEventDateDisplay(
        new Date("2026-06-16T22:00:00.000Z"),
        new Date("2026-06-17T23:00:00.000Z"),
        { timezone: "Europe/Amsterdam" },
      ),
    ).toEqual({
      endLabel: "Thu, Jun 18, 2026",
      isSameDay: false,
      startLabel: "Wed, Jun 17",
    });
  });
});
