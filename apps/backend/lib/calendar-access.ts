import type { PrismaClient } from "../generated/prisma/index.js";
import { ValidationError } from "./errors";

export interface CalendarWritabilityFields {
  kind: string;
  isSyncOnly: boolean;
}

export function isCalendarWritable(calendar: CalendarWritabilityFields): boolean {
  return calendar.kind === "owned" && !calendar.isSyncOnly;
}

export function assertCalendarWritable(
  calendar: CalendarWritabilityFields,
  message = "Cannot modify a read-only calendar. This calendar is managed by a subscription or public feed.",
  field = "calendarId",
): void {
  if (!isCalendarWritable(calendar)) {
    throw new ValidationError(message, field);
  }
}

export async function findUserCalendarById(
  prisma: PrismaClient,
  userId: string,
  calendarId: string,
) {
  return prisma.calendar.findFirst({
    where: { id: calendarId, userId },
  });
}

export async function findUserCalendarOrThrow(
  prisma: PrismaClient,
  userId: string,
  calendarId: string,
) {
  const calendar = await findUserCalendarById(prisma, userId, calendarId);
  if (!calendar) {
    throw new ValidationError(
      "Invalid calendar or calendar does not belong to user",
      "calendarId",
    );
  }
  return calendar;
}
