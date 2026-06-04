import {
  THEME_OPTIONS,
  VIEW_OPTIONS,
  WEEK_START_OPTIONS,
  TIME_FORMAT_OPTIONS,
  WEEKDAY_OPTIONS,
} from "./settings-options";

jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));

describe("settings-options", () => {
  it("exposes the three theme preferences with icons", () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual([
      "light",
      "dark",
      "system",
    ]);
    expect(THEME_OPTIONS.every((o) => typeof o.icon === "string")).toBe(true);
  });

  it("covers every calendar view in the view options", () => {
    expect(VIEW_OPTIONS.map((o) => o.value)).toEqual([
      "month",
      "week",
      "day",
      "3day",
      "agenda",
    ]);
  });

  it("offers Sunday and Monday as week-start choices", () => {
    expect(WEEK_START_OPTIONS.map((o) => o.value)).toEqual([0, 1]);
  });

  it("offers 12h and 24h time formats", () => {
    expect(TIME_FORMAT_OPTIONS.map((o) => o.value)).toEqual(["12h", "24h"]);
  });

  it("lists all seven weekdays with 0-indexed values", () => {
    expect(WEEKDAY_OPTIONS).toHaveLength(7);
    expect(WEEKDAY_OPTIONS.map((o) => o.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(WEEKDAY_OPTIONS[0].label).toBe("Sunday");
    expect(WEEKDAY_OPTIONS[6].label).toBe("Saturday");
  });
});
