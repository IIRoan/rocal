import type {
  CreateCategoryRequest,
  CreateEventRequest,
  UpdateCategoryRequest,
  UpdateEventRequest,
} from "./types";
import { CALENDAR_COLORS, isValidCalendarColor } from "./color-utils";

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
