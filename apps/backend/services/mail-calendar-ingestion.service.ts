import { createLogger } from "@workspace/logger";
import type { Calendar, PrismaClient } from "../generated/prisma/index.js";
import {
  areParsedEventParticipantsDifferent,
  isEventModified,
  parseICSFile,
  type ParsedIcsEvent,
} from "../lib/ics-parser";
import { EventParticipantService } from "./event-participant.service";
import type { StalwartCalendarClientLike } from "../lib/stalwart-calendar";
import { buildStalwartEventPayload } from "../lib/stalwart-calendar-mapping";
import { errorString, errorMessage } from "../lib/errors";

const logger = createLogger("backend:mail-calendar-ingestion");

const MAX_ICS_CONTENT_BYTES = 1_048_576; // 1 MB
const MAX_ICS_EVENTS_PER_FILE = 100;

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
  | "id"
  | "name"
  | "color"
  | "kind"
  | "isVisible"
  | "isDefault"
  | "isSyncOnly"
  | "forceFullEncryption"
  | "stalwartAccountId"
  | "stalwartCalendarId"
>;

type IcsPayloadSource = {
  sourceId: string;
  icsContent: string;
};

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
    isCancelled: false,
    syncedAt: new Date(),
  };
}

export class MailCalendarIngestionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventParticipantService: EventParticipantService = new EventParticipantService(
      prisma,
    ),
    private readonly stalwartClient?: StalwartCalendarClientLike | null,
  ) {}

  async ingestFromEmails(input: {
    userId: string;
    emails: MailCalendarIngestionEmail[];
  }): Promise<MailCalendarImportSummary> {
    const payloadSources = input.emails.flatMap((email) =>
      extractIcsPayloads(email).map((icsContent) => ({
        sourceId: `Message ${email.id}`,
        icsContent,
      })),
    );

    return this.ingestPayloadSources({
      userId: input.userId,
      messagesScanned: input.emails.length,
      payloadSources,
    });
  }

  async ingestIcsContent(input: {
    userId: string;
    icsContent: string;
    sourceId?: string;
  }): Promise<MailCalendarImportSummary> {
    return this.ingestPayloadSources({
      userId: input.userId,
      messagesScanned: 1,
      payloadSources: [
        {
          sourceId: input.sourceId?.trim() || "Imported invitation",
          icsContent: input.icsContent,
        },
      ],
    });
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
          color: true,
          kind: true,
          isVisible: true,
          isDefault: true,
          isSyncOnly: true,
          forceFullEncryption: true,
          stalwartAccountId: true,
          stalwartCalendarId: true,
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
        color: true,
        kind: true,
        isVisible: true,
        isDefault: true,
        isSyncOnly: true,
        forceFullEncryption: true,
        stalwartAccountId: true,
        stalwartCalendarId: true,
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
        color: true,
        kind: true,
        isVisible: true,
        isDefault: true,
        isSyncOnly: true,
        forceFullEncryption: true,
        stalwartAccountId: true,
        stalwartCalendarId: true,
      },
    });
  }

  private async getStalwartAccountId(userId: string): Promise<string | null> {
    if (!this.stalwartClient) {
      return null;
    }

    const mailbox = await this.prisma.mailDirectoryEntry.findUnique({
      where: { userId },
      select: { stalwartAccountId: true },
    });

    return mailbox?.stalwartAccountId ?? null;
  }

  private buildRemoteEventPayload(
    calendarId: string,
    parsedEvent: ParsedIcsEvent,
  ) {
    return buildStalwartEventPayload({
      calendarId,
      uid: parsedEvent.uid,
      title: parsedEvent.title,
      description: parsedEvent.description ?? null,
      start: parsedEvent.start,
      end: parsedEvent.end,
      allDay: parsedEvent.allDay,
      timezone: parsedEvent.timezone || "UTC",
      location: parsedEvent.location ?? null,
      recurrence: recurrenceToJson(parsedEvent),
      reminder: null,
      participants: parsedEvent.participants ?? [],
    });
  }

  private async cancelEvents(
    userId: string,
    parsedEvents: ParsedIcsEvent[],
  ): Promise<number> {
    let updated = 0;

    for (const parsedEvent of parsedEvents) {
      const result = await this.prisma.calendarEvent.updateMany({
        where: {
          userId,
          externalId: parsedEvent.uid,
          subscriptionId: null,
        },
        data: {
          isCancelled: true,
          syncedAt: new Date(),
        },
      });
      updated += result.count;
    }

    return updated;
  }

  private async upsertEvents(
    userId: string,
    calendar: ImportTargetCalendar,
    stalwartAccountId: string | null,
    stalwartCalendarId: string | null,
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
    const pendingInvitationDispatchers: Array<() => Promise<void>> = [];

    let created = 0;
    let updated = 0;

    for (const parsedEvent of parsedEvents) {
      const existingEvent = existingByExternalId.get(parsedEvent.uid);
      let remoteEventId = existingEvent?.stalwartEventId ?? null;

      if (this.stalwartClient && stalwartAccountId && stalwartCalendarId) {
        const remotePayload = this.buildRemoteEventPayload(
          stalwartCalendarId,
          parsedEvent,
        );

        if (remoteEventId) {
          await this.stalwartClient.updateEvent({
            accountId: existingEvent?.stalwartAccountId ?? stalwartAccountId,
            eventId: remoteEventId,
            patch: remotePayload,
            sendSchedulingMessages: false,
          });
        } else {
          const remoteEvent = await this.stalwartClient.createEvent({
            accountId: stalwartAccountId,
            event: remotePayload,
            sendSchedulingMessages: false,
          });
          remoteEventId = remoteEvent.id;
        }
      }

      if (!existingEvent) {
        let createdEvent;
        try {
          createdEvent = await this.prisma.calendarEvent.create({
            data: {
              ...toEventUpdateData(parsedEvent),
              externalId: parsedEvent.uid,
              isSynced: false,
              userId,
              calendarId: calendar.id,
              stalwartAccountId,
              stalwartCalendarId,
              stalwartEventId: remoteEventId,
              stalwartUid: parsedEvent.uid,
              stalwartSyncedAt: remoteEventId ? new Date() : null,
            },
          });
        } catch (error) {
          if (this.stalwartClient && stalwartAccountId && remoteEventId) {
            try {
              await this.stalwartClient.deleteEvent({
                accountId: stalwartAccountId,
                eventId: remoteEventId,
                sendSchedulingMessages: false,
              });
            } catch (cleanupError) {
              logger.error("Failed to clean up remote event after local DB create failure", {
                remoteEventId,
                originalError: errorString(error),
                cleanupError: errorString(cleanupError),
              });
            }
          }
          throw error;
        }

        const createdParticipants =
          await this.eventParticipantService.syncParticipants({
            eventId: createdEvent.id,
            participants: parsedEvent.participants ?? [],
            tx: this.prisma,
          });
        pendingInvitationDispatchers.push(
          createdParticipants.sendPendingInvitations,
        );
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

      const eventChanged = isEventModified(existingEvent, parsedEvent);

      if (eventChanged) {
        await this.prisma.calendarEvent.update({
          where: { id: existingEvent.id },
          data: {
            ...toEventUpdateData(parsedEvent),
            stalwartAccountId,
            stalwartCalendarId,
            stalwartEventId: remoteEventId,
            stalwartUid: parsedEvent.uid,
            stalwartSyncedAt: remoteEventId ? new Date() : null,
          },
        });
        updated++;
      } else if (remoteEventId && !existingEvent.stalwartEventId) {
        await this.prisma.calendarEvent.update({
          where: { id: existingEvent.id },
          data: {
            stalwartAccountId,
            stalwartCalendarId,
            stalwartEventId: remoteEventId,
            stalwartUid: parsedEvent.uid,
            stalwartSyncedAt: new Date(),
          },
        });
      }

      if (participantsChanged) {
        const updatedParticipants =
          await this.eventParticipantService.syncParticipants({
            eventId: existingEvent.id,
            participants: parsedEvent.participants ?? [],
            tx: this.prisma,
          });
        pendingInvitationDispatchers.push(
          updatedParticipants.sendPendingInvitations,
        );
        if (!eventChanged) {
          updated++;
        }
      }
    }

    for (const sendPendingInvitations of pendingInvitationDispatchers) {
      await sendPendingInvitations();
    }

    return { created, updated };
  }

  private async ingestPayloadSources(input: {
    userId: string;
    messagesScanned: number;
    payloadSources: IcsPayloadSource[];
  }): Promise<MailCalendarImportSummary> {
    const summary = createEmptyMailCalendarImportSummary();
    summary.messagesScanned = input.messagesScanned;
    summary.icsPartsFound = input.payloadSources.length;

    if (input.payloadSources.length === 0) {
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

    const stalwartAccountId = await this.getStalwartAccountId(input.userId);
    const stalwartCalendarId = targetCalendar.stalwartCalendarId;

    for (const payload of input.payloadSources) {
      try {
        if (Buffer.byteLength(payload.icsContent, "utf8") > MAX_ICS_CONTENT_BYTES) {
          summary.errors.push(
            `${payload.sourceId}: ICS content exceeds the 1 MB size limit and was skipped.`,
          );
          continue;
        }

        const parseResult = parseICSFile(payload.icsContent, timezone);
        summary.errors.push(
          ...parseResult.errors.map((error) => `${payload.sourceId}: ${error}`),
        );

        if (parseResult.events.length === 0) {
          summary.errors.push(
            `${payload.sourceId}: no valid ICS events found.`,
          );
          continue;
        }

        if (parseResult.events.length > MAX_ICS_EVENTS_PER_FILE) {
          summary.errors.push(
            `${payload.sourceId}: ICS file contains ${parseResult.events.length} events which exceeds the limit of ${MAX_ICS_EVENTS_PER_FILE}; skipped.`,
          );
          continue;
        }

        if (parseResult.method === "CANCEL") {
          summary.eventsUpdated += await this.cancelEvents(
            input.userId,
            parseResult.events,
          );
          continue;
        }

        const result = await this.upsertEvents(
          input.userId,
          targetCalendar,
          stalwartAccountId,
          stalwartCalendarId,
          parseResult.events,
        );
        summary.eventsCreated += result.created;
        summary.eventsUpdated += result.updated;
      } catch (error) {
        const detail =
          errorMessage(error, "Unknown ICS import error");
        summary.errors.push(`${payload.sourceId}: ${detail}`);
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
}
