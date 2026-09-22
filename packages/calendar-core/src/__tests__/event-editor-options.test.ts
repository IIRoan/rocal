import {
  REMINDER_MINUTE_OPTIONS,
  findRepeatPreset,
  formatReminderShort,
  getRepeatPresets,
} from "../event-editor-options";

describe("getRepeatPresets", () => {
  const wednesday = new Date(2026, 8, 23, 9, 0);

  it("derives weekday, month day and month from the picker date", () => {
    const presets = getRepeatPresets(wednesday);
    expect(presets.map((preset) => preset.label)).toEqual([
      "Every day",
      "Every week on Wednesday",
      "Every weekday (Mon–Fri)",
      "Every month on day 23",
      "Every year on September 23",
    ]);
    expect(presets[1]?.rule.byWeekDay).toEqual([3]);
    expect(presets[4]?.rule).toEqual({
      frequency: "yearly",
      interval: 1,
      byMonth: [9],
      byMonthDay: [23],
    });
  });

  it("matches a stored rule to its preset and ignores custom rules", () => {
    const presets = getRepeatPresets(wednesday);
    expect(
      findRepeatPreset(presets, {
        frequency: "weekly",
        interval: 1,
        byWeekDay: [1, 2, 3, 4, 5],
      })?.key,
    ).toBe("weekdays");
    expect(
      findRepeatPreset(presets, { frequency: "daily", interval: 1, count: 5 }),
    ).toBeNull();
    expect(findRepeatPreset(presets, null)).toBeNull();
  });
});

describe("formatReminderShort", () => {
  it("formats every reminder option", () => {
    expect(REMINDER_MINUTE_OPTIONS.map(formatReminderShort)).toEqual([
      "5 min",
      "10 min",
      "15 min",
      "30 min",
      "1 hour",
      "2 hours",
      "6 hours",
      "12 hours",
      "1 day",
      "2 days",
      "3 days",
      "1 week",
    ]);
  });
});
