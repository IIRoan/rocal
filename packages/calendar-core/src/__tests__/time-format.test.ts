import { describe, expect, it } from "@jest/globals";
import { buildEventReminderMailView } from "../event-reminder-mail";
import {
  clockTimePattern,
  formatClockTime,
  formatClockTimeRange,
  formatDateTimeLabel,
  resolveTimeFormat,
} from "../time-format";

const AFTERNOON = new Date("2026-03-10T13:30:00.000Z");
const AMSTERDAM = "Europe/Amsterdam";

describe("resolveTimeFormat", () => {
  it("keeps valid settings and falls back to the server default", () => {
    expect(resolveTimeFormat("12h")).toBe("12h");
    expect(resolveTimeFormat("24h")).toBe("24h");
    expect(resolveTimeFormat(undefined)).toBe("24h");
    expect(resolveTimeFormat(null)).toBe("24h");
    expect(resolveTimeFormat("system")).toBe("24h");
  });

  it("maps to date-fns clock patterns", () => {
    expect(clockTimePattern("24h")).toBe("HH:mm");
    expect(clockTimePattern("12h")).toBe("h:mm a");
  });
});

describe("formatClockTime", () => {
  it("formats in the user's timezone with the chosen clock", () => {
    expect(formatClockTime(AFTERNOON, AMSTERDAM, "24h")).toBe("14:30");
    expect(formatClockTime(AFTERNOON, AMSTERDAM, "12h")).toBe("2:30 PM");
  });

  it("formats ranges and date-time labels without AM/PM in 24h", () => {
    const end = new Date("2026-03-10T15:00:00.000Z");
    expect(formatClockTimeRange(AFTERNOON, end, AMSTERDAM, "24h")).toBe(
      "14:30 – 16:00",
    );
    expect(formatClockTimeRange(AFTERNOON, end, AMSTERDAM, "12h")).toBe(
      "2:30 PM – 4:00 PM",
    );
    expect(formatDateTimeLabel(AFTERNOON, AMSTERDAM, "24h")).toMatch(
      /, 14:30$/,
    );
    expect(formatDateTimeLabel(AFTERNOON, AMSTERDAM, "12h")).toMatch(
      /, 2:30 PM$/,
    );
  });
});

describe("buildEventReminderMailView", () => {
  it("respects the time format setting", () => {
    const event = {
      id: "evt-1",
      title: "Standup",
      start: AFTERNOON,
      end: new Date("2026-03-10T14:00:00.000Z"),
      allDay: false,
    };

    const view24 = buildEventReminderMailView({
      event,
      timezone: AMSTERDAM,
      timeFormat: "24h",
    });
    const view12 = buildEventReminderMailView({
      event,
      timezone: AMSTERDAM,
      timeFormat: "12h",
    });

    expect(JSON.stringify(view24)).toContain("14:30");
    expect(JSON.stringify(view24)).not.toMatch(/AM|PM/);
    expect(JSON.stringify(view12)).toContain("2:30 PM");
  });
});
