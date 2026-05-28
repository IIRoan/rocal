import { ValidationError } from "./errors";

export const EVENT_TITLE_MAX_LENGTH = 255;
export const EVENT_DESCRIPTION_MAX_LENGTH = 1000;
export const EVENT_LOCATION_MAX_LENGTH = 255;
export const EVENT_MAX_REMINDER_MINUTES = 43200; // 30 days

export function validateEventTitleLength(title: string | null | undefined) {
  if (title && title.trim().length > EVENT_TITLE_MAX_LENGTH) {
    throw new ValidationError(
      `Title cannot exceed ${EVENT_TITLE_MAX_LENGTH} characters`,
      "title",
    );
  }
}

export function validateEventDescriptionLength(
  description: string | null | undefined,
) {
  if (description && description.length > EVENT_DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(
      `Description cannot exceed ${EVENT_DESCRIPTION_MAX_LENGTH} characters`,
      "description",
    );
  }
}

export function validateEventLocationLength(
  location: string | null | undefined,
) {
  if (location && location.length > EVENT_LOCATION_MAX_LENGTH) {
    throw new ValidationError(
      `Location cannot exceed ${EVENT_LOCATION_MAX_LENGTH} characters`,
      "location",
    );
  }
}

export function validateEventReminderMinutes(
  reminder: number | null | undefined,
): number | null | undefined {
  if (reminder === undefined || reminder === null) return reminder;
  const value = Number(reminder);
  if (
    Number.isNaN(value) ||
    value < 0 ||
    value > EVENT_MAX_REMINDER_MINUTES
  ) {
    throw new ValidationError(
      `Reminder must be a number between 0 and ${EVENT_MAX_REMINDER_MINUTES} minutes`,
      "reminder",
    );
  }
  return value;
}
