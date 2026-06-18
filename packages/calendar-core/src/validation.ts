import type {
  CreateCategoryRequest,
  CreateEventRequest,
  EventParticipantInput,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "./types";
import { CALENDAR_COLORS, isValidCalendarColor } from "./color-utils";
import { timezoneSchema } from "./route-schemas";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export function normalizeParticipantEmail(
  email: string | null | undefined,
): string {
  return email?.trim().replace(/^mailto:/i, "").toLowerCase() ?? "";
}

function validateParticipants(
  participants: EventParticipantInput[] | undefined,
): string[] {
  if (!participants) {
    return [];
  }

  const errors: string[] = [];
  const seenEmails = new Set<string>();

  participants.forEach((participant, index) => {
    const email = normalizeParticipantEmail(participant.email);
    const label = `Participant ${index + 1}`;

    if (!email) {
      errors.push(`${label} email is required`);
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      errors.push(`${label} must use a valid email address`);
    }

    if (participant.displayName && participant.displayName.length > 120) {
      errors.push(`${label} name cannot exceed 120 characters`);
    }

    if (seenEmails.has(email)) {
      errors.push(`${label} duplicates another participant email`);
      return;
    }

    seenEmails.add(email);
  });

  return errors;
}

/**
 * Validates event data before submission.
 * Returns an array of error messages (empty if valid).
 */
export function validateEventData(
  event: CreateEventRequest | UpdateEventRequest,
): string[] {
  const errors: string[] = [];

  if ("title" in event && (!event.title || !event.title.trim())) {
    errors.push("Title is required");
  }

  if ("calendarId" in event && !event.calendarId) {
    errors.push("Calendar is required");
  }

  if ("title" in event && event.title && event.title.length > 255) {
    errors.push("Title cannot exceed 255 characters");
  }

  if (
    "description" in event &&
    event.description &&
    event.description.length > 1000
  ) {
    errors.push("Description cannot exceed 1000 characters");
  }

  if ("location" in event && event.location && event.location.length > 255) {
    errors.push("Location cannot exceed 255 characters");
  }

  if ("start" in event && "end" in event && event.start && event.end) {
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    if (startDate >= endDate) {
      errors.push("End time must be after start time");
    }
  }

  if ("color" in event && event.color) {
    if (!isValidCalendarColor(event.color)) {
      errors.push(
        `Color must be one of: ${CALENDAR_COLORS.join(", ")} or a valid hex color`,
      );
    }
  }

  if ("timezone" in event && event.timezone) {
    const timezoneResult = timezoneSchema.safeParse(event.timezone);
    if (!timezoneResult.success) {
      errors.push("Invalid timezone identifier");
    }
  }

  if ("participants" in event) {
    errors.push(...validateParticipants(event.participants));
  }

  return errors;
}

/**
 * Validates category data before submission.
 * Returns an array of error messages (empty if valid).
 */
export function validateCategoryData(
  category: CreateCategoryRequest | UpdateCategoryRequest,
): string[] {
  const errors: string[] = [];

  if ("name" in category && (!category.name || !category.name.trim())) {
    errors.push("Category name is required");
  }

  if ("color" in category && category.color) {
    if (!isValidCalendarColor(category.color)) {
      errors.push(
        `Color must be one of: ${CALENDAR_COLORS.join(", ")} or a valid hex color`,
      );
    }
  }

  return errors;
}
