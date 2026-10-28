import type { Calendar, CreateCalendarRequest } from "./types";
import { isMailInvitationStagingCalendar } from "./mail-invitation-staging";

/** Seeded by the client so their names are encrypted before they reach the server. */
export const DEFAULT_CALENDARS: readonly CreateCalendarRequest[] = [
  { name: "Personal", color: "#10b981", isDefault: true },
  { name: "Work", color: "#3b82f6" },
  { name: "Family", color: "#f43f5e" },
];

export type PartitionedCalendars = {
  ownedCalendars: Calendar[];
  publicCalendars: Calendar[];
  subscribedCalendars: Calendar[];
};

/** Partitions calendars into owned, public holiday, and subscribed groups. */
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

/** Sidebar list that hides the mail-invitation staging calendar. */
export function listSidebarCalendars(calendars: Calendar[]): Calendar[] {
  return calendars.filter((calendar) => !isMailInvitationStagingCalendar(calendar));
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}
