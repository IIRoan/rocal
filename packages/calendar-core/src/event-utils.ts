export const REMINDER_OPTIONS_MINUTES = [0, 5, 10, 15, 30, 60] as const;

export type ReminderMinutes = (typeof REMINDER_OPTIONS_MINUTES)[number];

export function isValidReminderMinutes(
  minutes: number,
): minutes is ReminderMinutes {
  return REMINDER_OPTIONS_MINUTES.includes(minutes as ReminderMinutes);
}
