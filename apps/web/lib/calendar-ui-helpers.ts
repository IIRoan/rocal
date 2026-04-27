import type { Calendar } from "./types/calendar";

export type PartitionedCalendars = {
  ownedCalendars: Calendar[];
  publicCalendars: Calendar[];
  subscribedCalendars: Calendar[];
};

export function partitionCalendarsByKind(
  calendars: Calendar[],
): PartitionedCalendars {
  const ownedCalendars: Calendar[] = [];
  const publicCalendars: Calendar[] = [];
  const subscribedCalendars: Calendar[] = [];

  for (const calendar of calendars) {
    if (calendar.kind === "owned") {
      ownedCalendars.push(calendar);
      continue;
    }

    if (calendar.kind === "public_holiday") {
      publicCalendars.push(calendar);
      continue;
    }

    subscribedCalendars.push(calendar);
  }

  return {
    ownedCalendars,
    publicCalendars,
    subscribedCalendars,
  };
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