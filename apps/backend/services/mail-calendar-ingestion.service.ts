import { createLogger } from "@workspace/logger";
import type { PrismaClient } from "../generated/prisma/index.js";
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
import {
  resolveAcceptedInvitationTargetCalendar,
  resolveInvitationStagingCalendar,
  type InvitationTargetCalendar,
} from "../lib/mail-invitation-calendar";
import { resolveEventPersistencePolicy } from "../lib/event-encryption";
import {
  indexInvitationImportEncryption,
  type InvitationImportEncryptionPayload,
} from "@workspace/calendar-core";

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

type ImportTargetCalendar = InvitationTargetCalendar;

type MailInvitationAttendeeStatus = "accepted" | "tentative";

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

function hasEncryptedPayload(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

type InvitationLocalEventFields = Omit<
  ReturnType<typeof toEventUpdateData>,
  "title" | "description" | "location"
> & {
  title?: string;
  description?: string | null;
  location?: string | null;
  encryptedContent?: string;
  blindIndexTokens?: string;
  encryptionState?: string;
  encryptionKeyVersion?: number;
};

function buildInvitationLocalEventData(
  parsedEvent: ParsedIcsEvent,
  encryptionPayload?: InvitationImportEncryptionPayload,
  existingEncryptionState?: string | null,
): InvitationLocalEventFields {
  const schedulingData = toEventUpdateData(parsedEvent);

  if (existingEncryptionState === "encrypted") {
    const { start, end, allDay, recurrence, timezone, isCancelled, syncedAt } =
      schedulingData;
    return { start, end, allDay, recurrence, timezone, isCancelled, syncedAt };
  }

  if (!encryptionPayload || !hasEncryptedPayload(encryptionPayload.encryptedContent)) {
    return schedulingData;
  }

  const persistencePolicy = resolveEventPersistencePolicy({
    hasEncryptedPayload: true,
    title: parsedEvent.title,
    description: parsedEvent.description,
    location: parsedEvent.location,
  });

  return {
    ...schedulingData,
    title: persistencePolicy.title,
    description: persistencePolicy.description,
    location: persistencePolicy.location,
    encryptedContent: encryptionPayload.encryptedContent,
    ...(encryptionPayload.blindIndexTokens !== undefined
      ? { blindIndexTokens: JSON.stringify(encryptionPayload.blindIndexTokens) }
      : {}),
    encryptionState: persistencePolicy.encryptionState,
    encryptionKeyVersion: encryptionPayload.encryptionKeyVersion ?? 1,
  };
}

function extractEncryptionOnlyFields(data: InvitationLocalEventFields) {
  const fields: Partial<InvitationLocalEventFields> = {};

  if (data.title !== undefined) {
    fields.title = data.title;
  }
  if (data.description !== undefined) {
    fields.description = data.description;
  }
  if (data.location !== undefined) {
    fields.location = data.location;
  }
  if (data.encryptedContent !== undefined) {
    fields.encryptedContent = data.encryptedContent;
  }
  if (data.blindIndexTokens !== undefined) {
    fields.blindIndexTokens = data.blindIndexTokens;
  }
  if (data.encryptionState !== undefined) {
    fields.encryptionState = data.encryptionState;
  }
  if (data.encryptionKeyVersion !== undefined) {
    fields.encryptionKeyVersion = data.encryptionKeyVersion;
  }

  return fields;
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
    attendeeStatus?: MailInvitationAttendeeStatus;
    calendarId?: string;
    encryption?: InvitationImportEncryptionPayload[];
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
      attendeeStatus: input.attendeeStatus,
      calendarId: input.calendarId,
      sendSchedulingMessages: Boolean(input.attendeeStatus),
      encryptionByExternalId: indexInvitationImportEncryption(input.encryption),
    });
  }

  async declineIcsInvitation(input: {
    userId: string;
    icsContent: string;
  }): Promise<{ declined: true }> {
    if (Buffer.byteLength(input.icsContent, "utf8") > MAX_ICS_CONTENT_BYTES) {
      throw new Error("ICS content exceeds the 1 MB size limit.");
    }

    const timezone = await this.getUserTimezone(input.userId);
    const parseResult = parseICSFile(input.icsContent, timezone);
    const parsedEvent = parseResult.events[0];

    if (!parsedEvent) {
      return { declined: true };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    const userEmail = user?.email?.trim().toLowerCase() ?? null;
    if (!userEmail) {
      if (parsedEvent) {
        await this.recordDeclinedInvitationTombstone(input.userId, parsedEvent);
      }
      return { declined: true };
    }

    const stalwartAccountId = await this.getStalwartAccountId(input.userId);
    const targetCalendar = await resolveAcceptedInvitationTargetCalendar(
      this.prisma,
      input.userId,
    );

    if (!stalwartAccountId || !targetCalendar?.stalwartCalendarId || !this.stalwartClient) {
      await this.recordDeclinedInvitationTombstone(input.userId, parsedEvent);
      return { declined: true };
    }

    const participants = (parsedEvent.participants ?? []).map((participant) => ({
      ...participant,
      status:
        participant.email.trim().toLowerCase() === userEmail
          ? "declined"
          : participant.status,
    }));

    const remoteEvent = await this.stalwartClient.createEvent({
      accountId: stalwartAccountId,
      event: buildStalwartEventPayload({
        calendarId: targetCalendar.stalwartCalendarId,
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
        participants,
      }),
      sendSchedulingMessages: true,
    });

    try {
      await this.stalwartClient.deleteEvent({
        accountId: stalwartAccountId,
        eventId: remoteEvent.id,
        sendSchedulingMessages: false,
      });
    } catch (error) {
      logger.warn("Failed to clean up temporary decline event in Stalwart", {
        userId: input.userId,
        remoteEventId: remoteEvent.id,
        error: errorString(error),
      });
    }

    await this.recordDeclinedInvitationTombstone(input.userId, parsedEvent);
    return { declined: true };
  }

  private isUserDeclinedOnEvent(
    userId: string,
    event: {
      participants?: Array<{
        userId?: string | null;
        role?: string | null;
        status?: string | null;
      }> | null;
    },
  ): boolean {
    const participant = event.participants?.find(
      (entry) => entry.userId === userId && entry.role !== "organizer",
    );
    return participant?.status === "declined";
  }

  private async recordDeclinedInvitationTombstone(
    userId: string,
    parsedEvent: ParsedIcsEvent,
  ): Promise<void> {
    const stagingCalendar = await resolveInvitationStagingCalendar(
      this.prisma,
      userId,
    );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const userEmail = user?.email?.trim().toLowerCase() ?? null;
    const declinedParticipants = (parsedEvent.participants ?? []).map(
      (participant) => ({
        ...participant,
        status:
          userEmail &&
          participant.email.trim().toLowerCase() === userEmail
            ? ("declined" as const)
            : participant.status,
      }),
    );
    const localEventData = buildInvitationLocalEventData(parsedEvent);

    const existingEvent = await this.prisma.calendarEvent.findFirst({
      where: {
        userId,
        externalId: parsedEvent.uid,
        subscriptionId: null,
      },
      include: { participants: true },
    });

    if (existingEvent) {
      await this.prisma.calendarEvent.update({
        where: { id: existingEvent.id },
        data: {
          calendarId: stagingCalendar.id,
          stalwartEventId: null,
          stalwartSyncedAt: null,
        },
      });
      await this.eventParticipantService.syncParticipants({
        eventId: existingEvent.id,
        participants: declinedParticipants,
        tx: this.prisma,
      });
      return;
    }

    const createdEvent = await this.prisma.calendarEvent.create({
      data: {
        ...localEventData,
        title: localEventData.title ?? parsedEvent.title,
        externalId: parsedEvent.uid,
        isSynced: false,
        userId,
        calendarId: stagingCalendar.id,
      },
    });

    await this.eventParticipantService.syncParticipants({
      eventId: createdEvent.id,
      participants: declinedParticipants,
      tx: this.prisma,
    });
  }

  private async getUserTimezone(userId: string): Promise<string> {
    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });

    return userSettings?.timezone || "UTC";
  }

  private async applyAttendeeStatusForUser(input: {
    userId: string;
    eventId: string;
    status: MailInvitationAttendeeStatus;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    const userEmail = user?.email?.trim().toLowerCase();
    if (!userEmail) {
      return;
    }

    await this.prisma.eventParticipant.updateMany({
      where: {
        eventId: input.eventId,
        email: {
          equals: userEmail,
          mode: "insensitive",
        },
      },
      data: {
        status: input.status,
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

  private patchParsedEventAttendeeStatus(
    parsedEvent: ParsedIcsEvent,
    userEmail: string | null,
    status?: MailInvitationAttendeeStatus,
  ): ParsedIcsEvent {
    if (!status || !userEmail) {
      return parsedEvent;
    }

    return {
      ...parsedEvent,
      participants: (parsedEvent.participants ?? []).map((participant) => ({
        ...participant,
        status:
          participant.email.trim().toLowerCase() === userEmail
            ? status
            : participant.status,
      })),
    };
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
    options: {
      attendeeStatus?: MailInvitationAttendeeStatus;
      sendSchedulingMessages?: boolean;
      encryptionByExternalId?: Map<string, InvitationImportEncryptionPayload>;
    } = {},
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
    const sendSchedulingMessages = options.sendSchedulingMessages ?? false;
    const userEmail = options.attendeeStatus
      ? (
          await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          })
        )?.email
          ?.trim()
          .toLowerCase() ?? null
      : null;

    let created = 0;
    let updated = 0;

    for (const parsedEvent of parsedEvents) {
      const syncedParsedEvent = this.patchParsedEventAttendeeStatus(
        parsedEvent,
        userEmail,
        options.attendeeStatus,
      );
      const existingEvent = existingByExternalId.get(parsedEvent.uid);
      if (
        existingEvent &&
        this.isUserDeclinedOnEvent(userId, existingEvent) &&
        !options.attendeeStatus
      ) {
        continue;
      }
      let remoteEventId = existingEvent?.stalwartEventId ?? null;
      const shouldMoveToTargetCalendar =
        Boolean(existingEvent) && existingEvent!.calendarId !== calendar.id;

      if (
        this.stalwartClient &&
        stalwartAccountId &&
        stalwartCalendarId &&
        (sendSchedulingMessages || remoteEventId)
      ) {
        const remotePayload = this.buildRemoteEventPayload(
          stalwartCalendarId,
          syncedParsedEvent,
        );

        if (remoteEventId) {
          await this.stalwartClient.updateEvent({
            accountId: existingEvent?.stalwartAccountId ?? stalwartAccountId,
            eventId: remoteEventId,
            patch: remotePayload,
            sendSchedulingMessages,
          });
        } else {
          const remoteEvent = await this.stalwartClient.createEvent({
            accountId: stalwartAccountId,
            event: remotePayload,
            sendSchedulingMessages,
          });
          remoteEventId = remoteEvent.id;
        }
      }

      if (!existingEvent) {
        const encryptionPayload = options.encryptionByExternalId?.get(
          parsedEvent.uid,
        );
        const localEventData = buildInvitationLocalEventData(
          parsedEvent,
          encryptionPayload,
        );
        let createdEvent;
        try {
          createdEvent = await this.prisma.calendarEvent.create({
            data: {
              ...localEventData,
              title: localEventData.title ?? parsedEvent.title,
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
        if (!sendSchedulingMessages) {
          pendingInvitationDispatchers.push(
            createdParticipants.sendPendingInvitations,
          );
        }
        if (options.attendeeStatus) {
          await this.applyAttendeeStatusForUser({
            userId,
            eventId: createdEvent.id,
            status: options.attendeeStatus,
          });
        }
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

      const encryptionPayload = options.encryptionByExternalId?.get(
        parsedEvent.uid,
      );
      const localEventData = buildInvitationLocalEventData(
        parsedEvent,
        encryptionPayload,
        existingEvent.encryptionState,
      );
      const shouldApplyEncryption =
        Boolean(encryptionPayload) &&
        existingEvent.encryptionState !== "encrypted";

      const eventChanged = isEventModified(existingEvent, parsedEvent);
      const shouldUpdateEvent =
        eventChanged ||
        shouldMoveToTargetCalendar ||
        Boolean(options.attendeeStatus) ||
        shouldApplyEncryption;

      if (shouldUpdateEvent) {
        await this.prisma.calendarEvent.update({
          where: { id: existingEvent.id },
          data: {
            ...(eventChanged
              ? localEventData
              : shouldApplyEncryption
                ? extractEncryptionOnlyFields(localEventData)
                : {}),
            calendarId: calendar.id,
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
        if (!sendSchedulingMessages) {
          pendingInvitationDispatchers.push(
            updatedParticipants.sendPendingInvitations,
          );
        }
        if (!shouldUpdateEvent) {
          updated++;
        }
      }

      if (options.attendeeStatus) {
        await this.applyAttendeeStatusForUser({
          userId,
          eventId: existingEvent.id,
          status: options.attendeeStatus,
        });
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
    attendeeStatus?: MailInvitationAttendeeStatus;
    calendarId?: string;
    sendSchedulingMessages?: boolean;
    encryptionByExternalId?: Map<string, InvitationImportEncryptionPayload>;
  }): Promise<MailCalendarImportSummary> {
    const summary = createEmptyMailCalendarImportSummary();
    summary.messagesScanned = input.messagesScanned;
    summary.icsPartsFound = input.payloadSources.length;

    if (input.payloadSources.length === 0) {
      return summary;
    }

    const [timezone, targetCalendar] = await Promise.all([
      this.getUserTimezone(input.userId),
      input.attendeeStatus
        ? resolveAcceptedInvitationTargetCalendar(
            this.prisma,
            input.userId,
            input.calendarId,
          )
        : resolveInvitationStagingCalendar(this.prisma, input.userId),
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
          {
            attendeeStatus: input.attendeeStatus,
            sendSchedulingMessages: input.sendSchedulingMessages,
            encryptionByExternalId: input.encryptionByExternalId,
          },
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
