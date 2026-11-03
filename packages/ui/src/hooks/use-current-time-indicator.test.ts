import { describe, expect, it } from "@jest/globals";
import { wallClockToUtc } from "@workspace/calendar-core";

import { getCurrentTimeIndicator } from "./use-current-time-indicator";

// Zones far from any test machine's zone, so browser-local days would hide the line.
const ZONES = ["Pacific/Pago_Pago", "UTC", "Pacific/Kiritimati"];
const SATURDAY = new Date(2026, 10, 7);
const SUNDAY = new Date(2026, 10, 8);
const MONDAY = new Date(2026, 10, 9);

describe("getCurrentTimeIndicator", () => {
  it.each(ZONES)(
    "shows the line on Saturday in a Saturday–Monday 3-day view in %s",
    (timezone) => {
      const now = wallClockToUtc(SATURDAY, 10, 30, timezone);

      expect(
        getCurrentTimeIndicator(now, [SATURDAY, SUNDAY, MONDAY], timezone),
      ).toEqual({
        currentTimePosition: (10.5 / 24) * 100,
        currentTimeVisible: true,
        currentTime: { hours: 10, minutes: 30 },
      });
    },
  );

  it.each(ZONES)(
    "follows the %s day and wall clock near midnight",
    (timezone) => {
      for (const [hour, minutes] of [
        [0, 15],
        [23, 45],
      ] as const) {
        const now = wallClockToUtc(SUNDAY, hour, minutes, timezone);

        expect(getCurrentTimeIndicator(now, [SUNDAY], timezone)).toEqual({
          currentTimePosition: ((hour * 60 + minutes) / (24 * 60)) * 100,
          currentTimeVisible: true,
          currentTime: { hours: hour, minutes },
        });
        expect(
          getCurrentTimeIndicator(now, [SATURDAY], timezone).currentTimeVisible,
        ).toBe(false);
        expect(
          getCurrentTimeIndicator(now, [MONDAY], timezone).currentTimeVisible,
        ).toBe(false);
      }
    },
  );
});
