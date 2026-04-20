import type { CalendarEvent, Prisma } from "../generated/prisma/index.js";
import {
  parseICSFile as parseICSFileFromPackage,
  type IcsParseResult,
  type ParsedIcsEvent,
} from "@workspace/calendar-ics/parse-ics";

export type ParsedICSEvent = ParsedIcsEvent;
export type ICSParseResult = IcsParseResult;

export function parseICSFile(
  icsContent: string,
  userTimezone: string = "UTC",
): ICSParseResult {
  return parseICSFileFromPackage(icsContent, userTimezone);
}

export function convertParsedEventToCalendarEvent(
  parsedEvent: ParsedICSEvent,
  userId: string,
  calendarId: string,
  subscriptionId?: string,
): Prisma.CalendarEventCreateInput {
  return {
    title: parsedEvent.title,
    description: parsedEvent.description,
    start: parsedEvent.start,
    end: parsedEvent.end,
    allDay: parsedEvent.allDay,
    location: parsedEvent.location,
    recurrence: parsedEvent.recurrence
      ? JSON.stringify(parsedEvent.recurrence)
      : undefined,
    timezone: parsedEvent.timezone || "UTC",
    isSynced: !!subscriptionId,
    externalId: parsedEvent.uid,
    subscriptionId: subscriptionId,
    syncedAt: subscriptionId ? new Date() : undefined,
    user: {
      connect: { id: userId },
    },
    calendar: {
      connect: { id: calendarId },
    },
  };
}

export function isEventModified(
  existing: CalendarEvent,
  parsed: ParsedICSEvent,
): boolean {
  const parsedRecurrence = parsed.recurrence
    ? JSON.stringify(parsed.recurrence)
    : null;

  return (
    existing.title !== parsed.title ||
    existing.description !== (parsed.description || null) ||
    existing.start.getTime() !== parsed.start.getTime() ||
    existing.end.getTime() !== parsed.end.getTime() ||
    existing.allDay !== parsed.allDay ||
    existing.location !== (parsed.location || null) ||
    existing.recurrence !== parsedRecurrence ||
    existing.timezone !== (parsed.timezone || "UTC")
  );
}
