import type {
  CalendarSubscription,
  EventColor,
} from "@workspace/calendar-core";
import {
  isLikelyIcsFeedUrl,
  normalizeSubscriptionFeedUrl,
} from "@workspace/calendar-ics";
import {
  isNamedCalendarColor as isNamedCalendarColorValue,
  isValidCalendarColorValue,
} from "./calendar-color-utils";

export interface SubscriptionFieldErrors {
  name?: string;
  url?: string;
  color?: string;
}

export function isNamedCalendarColor(value: string): value is EventColor {
  return isNamedCalendarColorValue(value);
}

export {
  isValidCalendarColorValue,
  resolveCalendarSwatchColor,
} from "./calendar-color-utils";

export function validateCreateSubscriptionInput(input: {
  name: string;
  url: string;
  color: string;
}): SubscriptionFieldErrors {
  const errors: SubscriptionFieldErrors = {};
  const name = input.name.trim();
  const url = input.url.trim();
  const color = input.color.trim();

  if (!name) {
    errors.name = "Calendar name is required";
  } else if (name.length > 100) {
    errors.name = "Calendar name must be 100 characters or less";
  }

  if (!url) {
    errors.url = "Calendar URL is required";
  } else if (!isLikelyIcsFeedUrl(url)) {
    errors.url = "URL should point to a calendar feed";
  }

  if (!isValidCalendarColorValue(color)) {
    errors.color = "Please select a valid color";
  }

  return errors;
}

export function validateEditableSubscriptionInput(input: {
  name: string;
  color: string;
}): SubscriptionFieldErrors {
  const errors: SubscriptionFieldErrors = {};
  const name = input.name.trim();
  const color = input.color.trim();

  if (!name) {
    errors.name = "Calendar name is required";
  } else if (name.length > 100) {
    errors.name = "Calendar name must be 100 characters or less";
  }

  if (!isValidCalendarColorValue(color)) {
    errors.color = "Please select a valid color";
  }

  return errors;
}

export function normalizeSubscriptionUrl(value: string): string {
  return normalizeSubscriptionFeedUrl(value);
}

export function formatLastSync(lastSyncAt?: string | Date | null): string {
  if (!lastSyncAt) return "Never";

  const date = lastSyncAt instanceof Date ? lastSyncAt : new Date(lastSyncAt);
  if (Number.isNaN(date.getTime())) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

  return date.toLocaleDateString();
}

export function getSubscriptionType(
  subscription: CalendarSubscription,
): "holiday" | "external" {
  return subscription.calendar.kind === "public_holiday"
    ? "holiday"
    : "external";
}

export function sortSubscriptions(
  subscriptions: CalendarSubscription[],
): CalendarSubscription[] {
  return [...subscriptions].sort((left, right) => {
    const leftType = getSubscriptionType(left);
    const rightType = getSubscriptionType(right);

    if (leftType !== rightType) {
      return leftType === "holiday" ? -1 : 1;
    }

    return left.calendar.name.localeCompare(right.calendar.name);
  });
}
