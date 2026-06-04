export const REMINDER_OPTIONS_MINUTES = [0, 5, 10, 15, 30, 60] as const;

export const PARTICIPANTS_INVITE_HELP_TEXT =
  "Attendees you add here will appear across Solace and receive an email invitation.";

export type ReminderMinutes = (typeof REMINDER_OPTIONS_MINUTES)[number];

export function isValidReminderMinutes(
  minutes: number,
): minutes is ReminderMinutes {
  return REMINDER_OPTIONS_MINUTES.includes(minutes as ReminderMinutes);
}
