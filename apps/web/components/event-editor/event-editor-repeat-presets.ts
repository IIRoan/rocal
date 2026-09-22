import { format } from "date-fns";
import type { RecurrenceRule } from "@/lib/types/calendar";

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
