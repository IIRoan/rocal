import type { CalendarEvent, Prisma } from "../generated/prisma/index.js";
import {
  parseICSFile as parseICSFileFromPackage,
  type IcsParseResult,
  type ParsedIcsEvent,
} from "@workspace/calendar-ics/parse-ics";
import type { IcsParticipant } from "@workspace/calendar-ics";
import { normalizeParticipantEmail } from "./event-participants";

export type { IcsParseResult, ParsedIcsEvent };

// Matches Google Calendar's visual separator lines e.g. -::~:~::~:~:~:~:~:~:~:~:~:~::~:~::-
// Start and end with `-`; only `-`, `:`, `~` in between.
const GOOGLE_INVITE_SEPARATOR_LINE = /^-[-:~]{10,}$/;
// Pure editor boilerplate with no user-facing value
const GOOGLE_INVITE_BOILERPLATE_LINES = [/^Please do not edit this section\./i];

function cleanInviteDescriptionText(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim();
      if (!normalized) {
        return true;
      }

      if (GOOGLE_INVITE_SEPARATOR_LINE.test(normalized)) {
        return false;
      }

      return !GOOGLE_INVITE_BOILERPLATE_LINES.some((pattern) =>
        pattern.test(normalized),
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || undefined;
}

export function parseICSFile(
  icsContent: string,
  userTimezone: string = "UTC",
): IcsParseResult {
  const result = parseICSFileFromPackage(icsContent, userTimezone);
  return {
    ...result,
    events: result.events.map((event) => ({
      ...event,
      description: cleanInviteDescriptionText(event.description),
    })),
  };
}

export function convertParsedEventToCalendarEvent(
  parsedEvent: ParsedIcsEvent,
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
  parsed: ParsedIcsEvent,
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

export function areParsedEventParticipantsDifferent(
  existingParticipants: Array<{
    email: string;
    displayName: string | null;
    role: string;
    status: string;
  }>,
  parsedParticipants: IcsParticipant[] | undefined,
): boolean {
  const normalizedExisting = existingParticipants
    .map((participant) => ({
      email: normalizeParticipantEmail(participant.email),
      displayName: participant.displayName?.trim() || "",
      role: participant.role,
      status: participant.status,
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
  const normalizedParsed = (parsedParticipants ?? [])
    .map((participant) => ({
      email: normalizeParticipantEmail(participant.email),
      displayName: participant.displayName?.trim() || "",
      role: participant.role ?? "attendee",
      status:
        participant.role === "organizer"
          ? "accepted"
          : (participant.status ?? "pending"),
    }))
    .sort((left, right) => left.email.localeCompare(right.email));

  return (
    JSON.stringify(normalizedExisting) !== JSON.stringify(normalizedParsed)
  );
}
