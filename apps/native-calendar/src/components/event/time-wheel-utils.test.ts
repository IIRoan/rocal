import {
  WHEEL_HOURS_12,
  WHEEL_HOURS_24,
  WHEEL_MINUTES,
  formatPickerTime,
  isInMiddleCycle,
  middleRawIndex,
  nearestRawIndex,
  timeToWheelIndexes,
  wheelCycles,
  wheelIndexFromOffset,
  wheelIndexesToTime,
  wheelRowProjection,
  wheelValueAt,
} from "./time-wheel-utils";

describe("wheel columns", () => {
  it("lists every hour and minute", () => {
    expect(WHEEL_HOURS_24).toHaveLength(24);
    expect(WHEEL_HOURS_12[0]).toBe("12");
    expect(WHEEL_HOURS_12).toHaveLength(12);
    expect(WHEEL_MINUTES).toHaveLength(60);
    expect(WHEEL_MINUTES[37]).toBe("37");
  });
});

describe("timeToWheelIndexes / wheelIndexesToTime", () => {
  it("round-trips every minute of the day in both formats", () => {
    for (const format of ["12h", "24h"] as const) {
      for (let hours = 0; hours < 24; hours++) {
        for (const minutes of [0, 1, 37, 59]) {
          const indexes = timeToWheelIndexes(hours, minutes, format);
          expect(wheelIndexesToTime(indexes, format)).toEqual({
            hours,
            minutes,
          });
        }
      }
    }
  });

  it("maps midnight and noon to the 12 row in 12h", () => {
    expect(timeToWheelIndexes(0, 0, "12h")).toEqual({
      hourIndex: 0,
      minuteIndex: 0,
      meridiemIndex: 0,
    });
    expect(timeToWheelIndexes(12, 5, "12h")).toEqual({
      hourIndex: 0,
      minuteIndex: 5,
      meridiemIndex: 1,
    });
  });

  it("flips AM to PM without changing the hour row", () => {
    const indexes = timeToWheelIndexes(9, 30, "12h");
    expect(
      wheelIndexesToTime({ ...indexes, meridiemIndex: 1 }, "12h"),
    ).toEqual({ hours: 21, minutes: 30 });
  });
});

describe("formatPickerTime", () => {
  it("formats 12h times", () => {
    expect(formatPickerTime(new Date(2025, 0, 1, 0, 5), "12h")).toBe("12:05 AM");
    expect(formatPickerTime(new Date(2025, 0, 1, 13, 37), "12h")).toBe("1:37 PM");
  });

  it("formats 24h times", () => {
    expect(formatPickerTime(new Date(2025, 0, 1, 9, 5), "24h")).toBe("09:05");
    expect(formatPickerTime(new Date(2025, 0, 1, 23, 59), "24h")).toBe("23:59");
  });
});

describe("looping wheel indexes", () => {
  it("uses an odd number of cycles with enough rows for long flings", () => {
    for (const count of [12, 24, 60]) {
      const cycles = wheelCycles(count, true);
      expect(cycles % 2).toBe(1);
      expect(cycles * count).toBeGreaterThanOrEqual(400);
    }
    expect(wheelCycles(2, false)).toBe(1);
  });

  it("maps raw rows back to their value", () => {
    expect(wheelValueAt(0, 60)).toBe(0);
    expect(wheelValueAt(61, 60)).toBe(1);
    expect(wheelValueAt(-1, 60)).toBe(59);
  });

  it("starts in the middle cycle and detects when to recenter", () => {
    const cycles = wheelCycles(60, true);
    const raw = middleRawIndex(37, 60, cycles);
    expect(wheelValueAt(raw, 60)).toBe(37);
    expect(isInMiddleCycle(raw, 60, cycles)).toBe(true);
    expect(isInMiddleCycle(raw + 60, 60, cycles)).toBe(false);
  });

  it("takes the short way round for outside changes", () => {
    expect(nearestRawIndex(300, 59, 60, true)).toBe(299);
    expect(nearestRawIndex(359, 1, 60, true)).toBe(361);
    expect(nearestRawIndex(310, 15, 60, true)).toBe(315);
    expect(nearestRawIndex(1, 0, 2, false)).toBe(0);
  });
});

describe("wheelRowProjection", () => {
  it("leaves the centre row flat and fully visible", () => {
    const center = wheelRowProjection(0, 34);
    expect(center.opacity).toBe(1);
    expect(center.rotateX).toBe(0);
    expect(center.translateY).toBeCloseTo(0);
  });

  it("tilts rows away and fades them symmetrically", () => {
    const above = wheelRowProjection(2, 34);
    const below = wheelRowProjection(-2, 34);
    expect(above.rotateX).toBeGreaterThan(0);
    expect(below.rotateX).toBeCloseTo(-above.rotateX);
    expect(above.translateY).toBeGreaterThan(0);
    expect(below.translateY).toBeCloseTo(-above.translateY);
    expect(above.opacity).toBeCloseTo(below.opacity);
    expect(above.opacity).toBeLessThan(wheelRowProjection(1, 34).opacity);
  });

  it("hides rows past the edge of the drum", () => {
    expect(wheelRowProjection(4.2, 34).opacity).toBe(0);
    expect(wheelRowProjection(-6, 34).opacity).toBe(0);
  });
});

describe("wheelIndexFromOffset", () => {
  it("rounds to the nearest row and clamps to the list", () => {
    expect(wheelIndexFromOffset(0, 36, 60)).toBe(0);
    expect(wheelIndexFromOffset(53, 36, 60)).toBe(1);
    expect(wheelIndexFromOffset(55, 36, 60)).toBe(2);
    expect(wheelIndexFromOffset(-40, 36, 60)).toBe(0);
    expect(wheelIndexFromOffset(36 * 80, 36, 60)).toBe(59);
  });
});
