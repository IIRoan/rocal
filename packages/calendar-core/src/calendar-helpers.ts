import type { Calendar } from "./types";
import { isMailInvitationStagingCalendar } from "./mail-invitation-staging";

export type PartitionedCalendars = {
  ownedCalendars: Calendar[];
  publicCalendars: Calendar[];
  subscribedCalendars: Calendar[];
};

/**
 * Partitions calendars into owned, public holiday, and subscribed groups.
 */
export function partitionCalendarsByKind(
  calendars: Calendar[],
): PartitionedCalendars {
  const ownedCalendars: Calendar[] = [];
  const publicCalendars: Calendar[] = [];
  const subscribedCalendars: Calendar[] = [];

  for (const calendar of calendars) {
    if (calendar.kind === "owned") {
      if (!isMailInvitationStagingCalendar(calendar)) {
        ownedCalendars.push(calendar);
      }
      continue;
    }

    if (calendar.kind === "public_holiday") {
      publicCalendars.push(calendar);
      continue;
    }

    if (calendar.kind === "subscribed") {
      subscribedCalendars.push(calendar);
    }
  }

  return {
    ownedCalendars,
    publicCalendars,
    subscribedCalendars,
  };
}

/**
 * Calendars shown in navigation sidebars (excludes the hidden mail-invitation staging calendar).
 */
export function listSidebarCalendars(calendars: Calendar[]): Calendar[] {
  return calendars.filter((calendar) => !isMailInvitationStagingCalendar(calendar));
}

/**
 * Extracts a human-readable error message from an unknown error value.
 * Falls back to the provided default message.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}
