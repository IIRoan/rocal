import { describe, expect, it } from "@jest/globals";

import type { CreateEventRequest } from "../types";
import { validateEventData } from "../validation";

function buildEvent(
  overrides: Partial<CreateEventRequest> = {},
): CreateEventRequest {
  return {
    title: "Team sync",
    start: "2026-06-16T08:00:00.000Z",
    end: "2026-06-16T09:00:00.000Z",
    calendarId: "calendar-1",
    ...overrides,
  };
}

describe("validateEventData timezone validation", () => {
  it("accepts valid IANA timezone identifiers", () => {
    expect(
      validateEventData(
        buildEvent({ timezone: "Europe/Amsterdam" }),
      ),
    ).toEqual([]);
    expect(
      validateEventData(buildEvent({ timezone: "America/New_York" })),
    ).toEqual([]);
    expect(validateEventData(buildEvent({ timezone: "UTC" }))).toEqual([]);
  });

  it("rejects invalid timezone identifiers", () => {
    expect(
      validateEventData(buildEvent({ timezone: "Mars/Olympus" })),
    ).toContain("Invalid timezone identifier");
    expect(
      validateEventData(buildEvent({ timezone: "Not/A/Timezone" })),
    ).toContain("Invalid timezone identifier");
  });

  it("skips timezone validation when the field is omitted", () => {
    const { timezone: _timezone, ...eventWithoutTimezone } = buildEvent();

    expect(validateEventData(eventWithoutTimezone)).toEqual([]);
  });

  it("skips timezone validation for empty strings", () => {
    expect(validateEventData(buildEvent({ timezone: "" }))).toEqual([]);
  });
});
