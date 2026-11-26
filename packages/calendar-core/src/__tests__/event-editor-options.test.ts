import {
  REMINDER_MINUTE_OPTIONS,
  eventDurationOptions,
  findRepeatPreset,
  formatReminderShort,
  getDefaultReminderMinutes,
  getReminderMinutes,
  getRepeatPresets,
  normalizeReminderMinutes,
} from "../event-editor-options";
import {
  readUserSettingsPreferences,
  splitUserSettingsUpdate,
} from "../user-settings-preferences";

describe("default reminder", () => {
  it("keeps 15 minutes until the account picks another lead or none", () => {
    expect(getDefaultReminderMinutes(undefined)).toEqual([15]);
    expect(getDefaultReminderMinutes(60)).toEqual([60]);
    expect(getDefaultReminderMinutes(0)).toEqual([]);
  });

  it("seals only a lead from the reminder list or none", () => {
    expect(
      splitUserSettingsUpdate({ defaultReminderMinutes: 0 }).preferences,
    ).toEqual({ defaultReminderMinutes: 0 });
    expect(() =>
      splitUserSettingsUpdate({ defaultReminderMinutes: 7 }),
    ).toThrow();
    expect(
      readUserSettingsPreferences({
        defaultReminderMinutes: 1440,
        defaultEventDuration: 30,
      }),
    ).toEqual({ defaultReminderMinutes: 1440, defaultEventDuration: 30 });
    expect(readUserSettingsPreferences({ defaultReminderMinutes: 7 })).toEqual(
      {},
    );
  });

  it("offers event lengths in order and keeps a stored length off the list", () => {
    expect(eventDurationOptions(60).map((option) => option.value)).toEqual([
      15, 30, 45, 60, 90, 120,
    ]);
    expect(eventDurationOptions(50).map((option) => option.label)).toContain(
      "50 min",
    );
  });
});

describe("reminder minutes", () => {
  it("dedupes, drops non-positive values and sorts ascending", () => {
    expect(normalizeReminderMinutes([60, 0, 15, 60, -5, 5])).toEqual([5, 15, 60]);
  });

  it("reads enabled email notifications only", () => {
    expect(
      getReminderMinutes([
        { notificationType: "email", minutesBefore: 60, isEnabled: true },
        { notificationType: "email", minutesBefore: 10, isEnabled: false },
        { notificationType: "browser", minutesBefore: 5, isEnabled: true },
        { notificationType: "email", minutesBefore: 1440, isEnabled: true },
      ]),
    ).toEqual([60, 1440]);
  });

  it("falls back to the legacy reminder when no notifications are stored", () => {
    expect(getReminderMinutes([], 30)).toEqual([30]);
    expect(getReminderMinutes([], 0)).toEqual([]);
    expect(getReminderMinutes([], null)).toEqual([]);
    expect(
      getReminderMinutes(
        [{ notificationType: "email", minutesBefore: 5, isEnabled: true }],
        30,
      ),
    ).toEqual([5]);
  });
});

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
