import { describe, expect, it } from "@jest/globals";
import {
  formatCalendarDayKey,
  formatInstantCalendarDayKey,
  getWeekCalendarDays,
} from "@workspace/calendar-core";

import { parseDateParam } from "@/hooks/use-calendar-url-sync";

function weekStartKey(dayKey: string, timezone: string): string | undefined {
  const date = parseDateParam(dayKey, timezone);
  if (!date) return undefined;
  const firstDay = getWeekCalendarDays(date, 1, timezone)[0];
  return firstDay ? formatCalendarDayKey(firstDay) : undefined;
}

describe("calendar URL date param", () => {
  // Zones far from any test machine's zone, so a browser-local parse would land on the wrong day.
  const zones = ["Pacific/Pago_Pago", "UTC", "Europe/Amsterdam", "Pacific/Kiritimati"];

  it.each(zones)("opens the week of a Monday URL day in %s", (timezone) => {
    expect(weekStartKey("2026-11-02", timezone)).toBe("2026-11-02");
  });

  it.each(zones)("round-trips the URL day in %s", (timezone) => {
    const date = parseDateParam("2026-11-02", timezone);
    expect(date && formatInstantCalendarDayKey(date, timezone)).toBe("2026-11-02");
  });

  it("writes the account-zone day rather than the browser day", () => {
    const instant = new Date("2026-11-02T23:30:00.000Z");
    expect(formatInstantCalendarDayKey(instant, "UTC")).toBe("2026-11-02");
    expect(formatInstantCalendarDayKey(instant, "Europe/Amsterdam")).toBe("2026-11-03");
  });

  it("ignores malformed dates", () => {
    expect(parseDateParam("2026/11/02", "UTC")).toBeNull();
    expect(parseDateParam(null, "UTC")).toBeNull();
  });
});
