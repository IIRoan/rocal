import { createLogger } from "@workspace/logger";
import type {
  Calendar,
  PrismaClient,
} from "../generated/prisma/index.js";
import {
  areParsedEventParticipantsDifferent,
  isEventModified,
  parseICSFile,
  type ParsedIcsEvent,
} from "../lib/ics-parser";
import { EventParticipantService } from "./event-participant.service";

const logger = createLogger("backend:mail-calendar-ingestion");

const CALENDAR_MIME_TYPES = new Set([
  "text/calendar",
  "text/x-vcalendar",
  "application/ics",
  "application/ical",
  "application/x-ical",
]);

export type MailCalendarImportSummary = {
  messagesScanned: number;
  icsPartsFound: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  errors: string[];
};

export type MailCalendarIngestionEmail = {
  id: string;
  subject?: string | null;
  bodyStructure?: MailCalendarBodyStructure | null;
  bodyValues?: Record<string, MailCalendarBodyValue | undefined>;
};

type MailCalendarBodyValue = {
  value?: string;
};

type MailCalendarBodyStructure = {
  partId?: string;
  type?: string | null;
  name?: string | null;
  subParts?: MailCalendarBodyStructure[];
};

type ImportTargetCalendar = Pick<
  Calendar,
  "id" | "name" | "kind" | "isSyncOnly" | "forceFullEncryption"
>;

export function createEmptyMailCalendarImportSummary(): MailCalendarImportSummary {
  return {
    messagesScanned: 0,
    icsPartsFound: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsDeleted: 0,
    errors: [],
  };
}

function normalizeContentType(value?: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function hasIcsFilename(value?: string | null): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.endsWith(".ics") || normalized.endsWith(".ical");
}

function looksLikeCalendarPayload(value: string): boolean {
  return /BEGIN:VCALENDAR/i.test(value);
}

function isCalendarBodyPart(part: MailCalendarBodyStructure): boolean {
  return (
    CALENDAR_MIME_TYPES.has(normalizeContentType(part.type)) ||
    hasIcsFilename(part.name)
  );
}

function collectCalendarPartIds(
  part: MailCalendarBodyStructure | null | undefined,
  partIds: Set<string>,
): void {
  if (!part) {
    return;
  }

  if (part.partId && isCalendarBodyPart(part)) {
    partIds.add(part.partId);
  }

  for (const subPart of part.subParts ?? []) {
    collectCalendarPartIds(subPart, partIds);
  }
}

function extractIcsPayloads(message: MailCalendarIngestionEmail): string[] {
  const bodyValues = message.bodyValues ?? {};
  const calendarPartIds = new Set<string>();
  collectCalendarPartIds(message.bodyStructure, calendarPartIds);

  const payloads = new Map<string, string>();

  for (const partId of calendarPartIds) {
    const value = bodyValues[partId]?.value?.trim();
    if (value && looksLikeCalendarPayload(value)) {
      payloads.set(partId, value);
    }
  }

  for (const [partId, bodyValue] of Object.entries(bodyValues)) {
    const value = bodyValue?.value?.trim();
    if (value && looksLikeCalendarPayload(value)) {
      payloads.set(partId, value);
    }
  }

  return [...payloads.values()];
}

function recurrenceToJson(parsedEvent: ParsedIcsEvent): string | null {
  return parsedEvent.recurrence ? JSON.stringify(parsedEvent.recurrence) : null;
}

function toEventUpdateData(parsedEvent: ParsedIcsEvent) {
  return {
    title: parsedEvent.title,
    description: parsedEvent.description ?? null,
    start: parsedEvent.start,
    end: parsedEvent.end,
    allDay: parsedEvent.allDay,
    location: parsedEvent.location ?? null,
    recurrence: recurrenceToJson(parsedEvent),
    timezone: parsedEvent.timezone || "UTC",
    syncedAt: new Date(),
  };
}

export class MailCalendarIngestionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventParticipantService: EventParticipantService = new EventParticipantService(
      prisma,
    ),
  ) {}

  async ingestFromEmails(input: {
    userId: string;
    emails: MailCalendarIngestionEmail[];
  }): Promise<MailCalendarImportSummary> {
    const summary = createEmptyMailCalendarImportSummary();

    if (input.emails.length === 0) {
      return summary;
    }

    const payloadsByMessage = input.emails
      .map((email) => ({
        email,
        payloads: extractIcsPayloads(email),
      }))
      .filter((entry) => entry.payloads.length > 0);

    summary.messagesScanned = input.emails.length;
    summary.icsPartsFound = payloadsByMessage.reduce(
      (total, entry) => total + entry.payloads.length,
      0,
    );

    if (payloadsByMessage.length === 0) {
      return summary;
    }

    const [timezone, targetCalendar] = await Promise.all([
      this.getUserTimezone(input.userId),
      this.resolveImportCalendar(input.userId),
    ]);

    if (!targetCalendar) {
      summary.errors.push(
        "No writable calendar is available for ICS mail imports.",
      );
      return summary;
    }

    if (targetCalendar.forceFullEncryption) {
      summary.errors.push(
        `Calendar "${targetCalendar.name}" requires full encryption; mailed ICS events were not imported because the server cannot create encrypted event payloads.`,
      );
      return summary;
    }

    for (const { email, payloads } of payloadsByMessage) {
      for (const icsContent of payloads) {
        try {
          const parseResult = parseICSFile(icsContent, timezone);
          summary.errors.push(
            ...parseResult.errors.map(
              (error) => `Message ${email.id}: ${error}`,
            ),
          );

          if (parseResult.events.length === 0) {
            summary.errors.push(
              `Message ${email.id}: no valid ICS events found.`,
            );
            continue;
          }

          if (parseResult.method === "CANCEL") {
            summary.eventsDeleted += await this.deleteCancelledEvents(
              input.userId,
              parseResult.events,
            );
            continue;
          }

          const result = await this.upsertEvents(
            input.userId,
            targetCalendar.id,
            parseResult.events,
          );
          summary.eventsCreated += result.created;
          summary.eventsUpdated += result.updated;
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : "Unknown ICS import error";
          summary.errors.push(`Message ${email.id}: ${detail}`);
        }
      }
    }

    if (
      summary.eventsCreated > 0 ||
      summary.eventsUpdated > 0 ||
      summary.eventsDeleted > 0
    ) {
      logger.info("Imported calendar changes from mail", {
        userId: input.userId,
        calendarId: targetCalendar.id,
        eventsCreated: summary.eventsCreated,
        eventsUpdated: summary.eventsUpdated,
        eventsDeleted: summary.eventsDeleted,
      });
    }

    return summary;
  }

  private async getUserTimezone(userId: string): Promise<string> {
    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });

    return userSettings?.timezone || "UTC";
  }

  private async resolveImportCalendar(
    userId: string,
  ): Promise<ImportTargetCalendar | null> {
    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { defaultCalendarId: true },
    });

    const writableCalendarWhere = {
      userId,
      kind: "owned",
      isSyncOnly: false,
      forceFullEncryption: false,
    } as const;

    if (userSettings?.defaultCalendarId) {
      const defaultCalendar = await this.prisma.calendar.findFirst({
        where: {
          ...writableCalendarWhere,
          id: userSettings.defaultCalendarId,
        },
        select: {
          id: true,
          name: true,
          kind: true,
          isSyncOnly: true,
          forceFullEncryption: true,
        },
      });

      if (defaultCalendar) {
        return defaultCalendar;
      }
    }

    const existingCalendar = await this.prisma.calendar.findFirst({
      where: writableCalendarWhere,
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        isSyncOnly: true,
        forceFullEncryption: true,
      },
    });

    if (existingCalendar) {
      return existingCalendar;
    }

    const calendarCount = await this.prisma.calendar.count({
      where: { userId },
    });

    if (calendarCount > 0) {
      return null;
    }

    return this.prisma.calendar.create({
      data: {
        name: "Personal",
        color: "#10b981",
        kind: "owned",
        isPublic: false,
        isVisible: true,
        isDefault: true,
        userId,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        isSyncOnly: true,
        forceFullEncryption: true,
      },
    });
  }

  private async deleteCancelledEvents(
    userId: string,
    parsedEvents: ParsedIcsEvent[],
  ): Promise<number> {
    let deleted = 0;

    for (const parsedEvent of parsedEvents) {
      const result = await this.prisma.calendarEvent.deleteMany({
        where: {
          userId,
          externalId: parsedEvent.uid,
          subscriptionId: null,
        },
      });
      deleted += result.count;
    }

    return deleted;
  }

  private async upsertEvents(
    userId: string,
    calendarId: string,
    parsedEvents: ParsedIcsEvent[],
  ): Promise<{ created: number; updated: number }> {
    const existingEvents = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        externalId: { in: parsedEvents.map((event) => event.uid) },
        subscriptionId: null,
      },
      include: {
        participants: true,
      },
    });
    const existingByExternalId = new Map(
      existingEvents.map((event) => [event.externalId, event]),
    );

    let created = 0;
    let updated = 0;

    for (const parsedEvent of parsedEvents) {
      const existingEvent = existingByExternalId.get(parsedEvent.uid);

      if (!existingEvent) {
        const createdEvent = await this.prisma.calendarEvent.create({
          data: {
            ...toEventUpdateData(parsedEvent),
            externalId: parsedEvent.uid,
            isSynced: false,
            userId,
            calendarId,
          },
        });
        const createdParticipants =
          await this.eventParticipantService.syncParticipants({
            eventId: createdEvent.id,
            participants: parsedEvent.participants ?? [],
            tx: this.prisma,
          });
        await createdParticipants.sendPendingInvitations();
        created++;
        continue;
      }

      const participantsChanged = areParsedEventParticipantsDifferent(
        (existingEvent.participants ?? []).map((participant) => ({
          email: participant.email,
          displayName: participant.displayName,
          role: participant.role,
          status: participant.status,
        })),
        parsedEvent.participants,
      );

      if (isEventModified(existingEvent, parsedEvent)) {
        await this.prisma.calendarEvent.update({
          where: { id: existingEvent.id },
          data: toEventUpdateData(parsedEvent),
        });
        updated++;
      }

      if (participantsChanged) {
        const updatedParticipants =
          await this.eventParticipantService.syncParticipants({
            eventId: existingEvent.id,
            participants: parsedEvent.participants ?? [],
            tx: this.prisma,
          });
        await updatedParticipants.sendPendingInvitations();
        if (!isEventModified(existingEvent, parsedEvent)) {
          updated++;
        }
      }
    }

    return { created, updated };
  }
}
