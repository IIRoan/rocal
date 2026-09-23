import { format } from "date-fns";
import type { RecurrenceRule } from "./types";

export type RepeatPreset = {
  key: string;
  label: string;
  rule: RecurrenceRule;
};

/** Presets derive from the wall-clock picker date, never from a UTC instant. */
export function getRepeatPresets(startDate: Date): RepeatPreset[] {
  const weekday = startDate.getDay();
  const monthDay = startDate.getDate();
  return [
    { key: "daily", label: "Every day", rule: { frequency: "daily", interval: 1 } },
    {
      key: "weekly",
      label: `Every week on ${format(startDate, "EEEE")}`,
      rule: { frequency: "weekly", interval: 1, byWeekDay: [weekday] },
    },
    {
      key: "weekdays",
      label: "Every weekday (Mon–Fri)",
      rule: { frequency: "weekly", interval: 1, byWeekDay: [1, 2, 3, 4, 5] },
    },
    {
      key: "monthly",
      label: `Every month on day ${monthDay}`,
      rule: { frequency: "monthly", interval: 1, byMonthDay: [monthDay] },
    },
    {
      key: "yearly",
      label: `Every year on ${format(startDate, "MMMM d")}`,
      rule: {
        frequency: "yearly",
        interval: 1,
        byMonth: [startDate.getMonth() + 1],
        byMonthDay: [monthDay],
      },
    },
  ];
}

function ruleSignature(rule: RecurrenceRule) {
  return JSON.stringify([
    rule.frequency,
    rule.interval,
    rule.byWeekDay ?? [],
    rule.byMonthDay ?? [],
    rule.byMonth ?? [],
    rule.count ?? null,
    rule.until ? new Date(rule.until).getTime() : null,
  ]);
}

export function findRepeatPreset(
  presets: RepeatPreset[],
  rule: RecurrenceRule | null,
): RepeatPreset | null {
  if (!rule) {
    return null;
  }
  const signature = ruleSignature(rule);
  return presets.find((preset) => ruleSignature(preset.rule) === signature) ?? null;
}

export const REMINDER_MINUTE_OPTIONS = [
  5, 10, 15, 30, 60, 120, 360, 720, 1440, 2880, 4320, 10080,
] as const;

export function normalizeReminderMinutes(minutes: readonly number[]): number[] {
  return [...new Set(minutes.filter((value) => value > 0))].sort(
    (left, right) => left - right,
  );
}

/** Enabled email reminders are what the worker delivers; the legacy single reminder covers events saved before the list existed. */
export function getReminderMinutes(
  notifications: ReadonlyArray<{
    notificationType: string;
    minutesBefore: number;
    isEnabled: boolean;
  }>,
  fallbackReminder?: number | null,
): number[] {
  const minutes = normalizeReminderMinutes(
    notifications.flatMap((notification) =>
      notification.isEnabled && notification.notificationType === "email"
        ? [Number(notification.minutesBefore) || 0]
        : [],
    ),
  );
  if (minutes.length > 0) return minutes;
  return fallbackReminder && fallbackReminder > 0 ? [fallbackReminder] : [];
}

function pluralUnit(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/** Short reminder copy shared by the reminder chips, e.g. "15 min" or "2 hours". */
export function formatReminderShort(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return pluralUnit(minutes / 60, "hour");
  if (minutes % 10080 === 0) return pluralUnit(minutes / 10080, "week");
  return pluralUnit(minutes / 1440, "day");
}
