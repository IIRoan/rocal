import type { PrismaClient } from "../generated/prisma/index.js";
import {
  resolveTimezone,
  type EventParticipantInput,
  type EventParticipantStatus,
  type OperationWarning,
} from "@workspace/calendar-core";
import type {
  IEventService,
  EventSearchCorpusInput,
  EventSearchInput,
  EventListInput,
  EventCreateInput,
  EventUpdateInput,
  EventBulkInput,
  EventDeleteResult,
  EventBulkResult,
  EventIcsExportResult,
  EventMutationResult,
} from "../contracts/event.contract";
import { ValidationError } from "../lib/errors";
import { prismaStringEquals } from "../lib/prisma-query";
import { reminderScheduleWarning } from "../lib/email-delivery";
import {
  firstNotificationDisplayTitle,
  shouldScheduleEventReminder,
} from "../lib/notification-job";
import { errorLogDetails } from "../lib/log-sanitization";
import {
  assertCalendarWritable,
  findUserCalendarOrThrow,
  isCalendarWritable,
} from "../lib/calendar-access";
import {
  validateEventDescriptionLength,
  validateEventLocationLength,
  validateEventReminderMinutes,
  validateEventTitleLength,
  validateOptionalEventFields,
} from "../lib/event-constraints";
import { MS_PER_DAY, MS_PER_MINUTE } from "../lib/time-constants";
import { ensureUserCalendars } from "../lib/user-setup";
import {
  resolveAcceptedInvitationTargetCalendar,
  resolveInvitationStagingCalendar,
} from "../lib/mail-invitation-calendar";
import { RecurrenceEngine } from "../lib/recurrence";
import { NotificationCalculator } from "../lib/notification-calculator";
import { ALLOWED_CALENDAR_COLORS, isValidCalendarColor } from "../lib/colors";
import {
  resolveEventPersistencePolicy,
} from "../lib/event-encryption";
import {
  buildIcsEventFile,
  type IcsBuildEventInput,
} from "@workspace/calendar-ics";
import { toIcsBuildEvent, toSafeIcsFilename } from "../lib/ics-export";
import { createLogger } from "@workspace/logger";
import {
  mapEventParticipant,
  mapAndSortParticipants,
  resolveParticipantInputs,
  sortEventParticipants,
  EVENT_PARTICIPANT_USER_SELECT,
  EVENT_WITH_RELATIONS_INCLUDE,
  EVENT_WITH_RECURRENCE_INCLUDE,
  type EventParticipantRecord,
} from "../lib/event-participants";
import { EventParticipantService } from "./event-participant.service";
import type {
  StalwartCalendarClientLike,
  StalwartCalendarEventRecord,
} from "../lib/stalwart-calendar";
import {
  buildStalwartEventPayload,
  mapStalwartParticipantsToSolace,
  mapStalwartEventToSolace,
  type ResolvedStalwartParticipant,
} from "../lib/stalwart-calendar-mapping";

const logger = createLogger("backend:event-service");

const INITIALIZED_USER_CACHE_LIMIT = 5000;

export class EventService implements IEventService {
  private readonly initializedUsers = new Set<string>();
  private stalwartListSyncInFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventParticipantService: EventParticipantService = new EventParticipantService(
      prisma,
    ),
    private readonly stalwartClient?: StalwartCalendarClientLike | null,
  ) {}

  private hasEncryptedPayload(value?: string | null): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  private async insertUpcomingEventReminder(input: {
    eventId: string;
    eventStart: Date;
    minutesBefore: number;
    timezone: string;
    displayTitle: string | null;
    notificationType?: "email" | "browser";
  }): Promise<boolean> {
    const schedule = NotificationCalculator.scheduleUpcomingReminder(
      input.eventStart,
      input.minutesBefore,
      input.timezone,
    );
    if (!schedule) {
      return false;
    }

    await this.prisma.eventNotification.create({
      data: {
        eventId: input.eventId,
        notificationType: input.notificationType ?? "email",
        minutesBefore: input.minutesBefore,
        notificationTime: schedule.notificationTime,
        notificationDateLocal: schedule.notificationDateLocal,
        notificationTimezone: schedule.notificationTimezone,
        isEnabled: true,
        isSent: false,
        displayTitle: input.displayTitle,
      },
    });
    return true;
  }

  private async resolveEventTimezone(
    userId: string,
    requestedTimezone?: string,
  ): Promise<string> {
    if (requestedTimezone?.trim()) {
      return requestedTimezone.trim();
    }

    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { timezone: true },
    });

    return resolveTimezone(userSettings?.timezone);
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

  private async resolveStalwartParticipants(
    userId: string,
    participants: EventParticipantInput[] = [],
  ): Promise<ResolvedStalwartParticipant[]> {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    return resolveParticipantInputs({
      owner: owner?.email?.trim()
        ? {
            email: owner.email,
            name: owner.name,
          }
        : null,
      participants,
    });
  }

  private async ensureRemoteCalendar(input: {
    accountId: string;
    calendar: {
      id: string;
      name: string;
      color: string;
      isVisible: boolean;
      isDefault: boolean;
      stalwartCalendarId?: string | null;
      kind: string;
      isSyncOnly: boolean;
    };
  }): Promise<string | null> {
    if (
      !this.stalwartClient ||
      input.calendar.kind !== "owned" ||
      input.calendar.isSyncOnly
    ) {
      return null;
    }

    if (input.calendar.stalwartCalendarId) {
      return input.calendar.stalwartCalendarId;
    }

    const remote = await this.stalwartClient.createCalendar(input.accountId, {
      name: input.calendar.name,
      color: input.calendar.color,
      isVisible: input.calendar.isVisible,
      isDefault: input.calendar.isDefault,
    });
    await this.prisma.calendar.update({
      where: { id: input.calendar.id },
      data: {
        stalwartAccountId: input.accountId,
        stalwartCalendarId: remote.id,
        stalwartSyncedAt: new Date(),
      },
    });

    return remote.id;
  }

  private scheduleStalwartEventsSync(input: {
    userId: string;
    accountId: string;
    startDate: Date;
    endDate: Date;
  }): void {
    if (this.stalwartListSyncInFlight.has(input.userId)) {
      return;
    }

    const syncPromise = this.syncStalwartEvents(input)
      .catch((error) => {
        logger.error("Stalwart list sync failed", errorLogDetails(error));
      })
      .finally(() => {
        this.stalwartListSyncInFlight.delete(input.userId);
      });

    this.stalwartListSyncInFlight.set(input.userId, syncPromise);
  }

  private async syncStalwartEvents(input: {
    userId: string;
    accountId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<void> {
    if (!this.stalwartClient) return;

    const ids = await this.stalwartClient.queryEventIds({
      accountId: input.accountId,
      filter: {
        after: input.startDate.toISOString(),
        before: input.endDate.toISOString(),
      },
      limit: 500,
    });
    await this.syncStalwartEventsByIds({
      userId: input.userId,
      accountId: input.accountId,
      eventIds: ids,
    });
  }

  private async syncStalwartEventsByIds(input: {
    userId: string;
    accountId: string;
    eventIds: string[];
  }): Promise<void> {
    if (!this.stalwartClient || input.eventIds.length === 0) {
      return;
    }

    const remoteEvents = await this.stalwartClient.getEvents({
      accountId: input.accountId,
      ids: input.eventIds,
    });
    await this.upsertStalwartEventsFromRemote({
      userId: input.userId,
      accountId: input.accountId,
      remoteEvents,
    });
  }

  private async syncStalwartEventByUid(input: {
    userId: string;
    accountId: string;
    uid: string;
  }): Promise<void> {
    if (!this.stalwartClient || !input.uid.trim()) {
      return;
    }

    const ids = await this.stalwartClient.queryEventIds({
      accountId: input.accountId,
      filter: {
        uid: input.uid.trim(),
      },
      limit: 10,
    });
    await this.syncStalwartEventsByIds({
      userId: input.userId,
      accountId: input.accountId,
      eventIds: ids,
    });
  }

  private async upsertStalwartEventsFromRemote(input: {
    userId: string;
    accountId: string;
    remoteEvents: StalwartCalendarEventRecord[];
  }): Promise<void> {
    if (input.remoteEvents.length === 0) {
      return;
    }

    const calendars = await this.prisma.calendar.findMany({
      where: { userId: input.userId, stalwartCalendarId: { not: null } },
      select: {
        id: true,
        stalwartCalendarId: true,
      },
    });
    const calendarByRemoteId = new Map(
      calendars.map((calendar) => [calendar.stalwartCalendarId!, calendar.id]),
    );

    for (const remoteEvent of input.remoteEvents) {
      const mapped = mapStalwartEventToSolace(remoteEvent);
      const calendarId = mapped.stalwartCalendarId
        ? calendarByRemoteId.get(mapped.stalwartCalendarId)
        : null;
      if (!calendarId) continue;

      const existing = await this.prisma.calendarEvent.findFirst({
        where: {
          userId: input.userId,
          OR: [
            { stalwartEventId: mapped.stalwartEventId },
            ...(mapped.stalwartUid ? [{ externalId: mapped.stalwartUid }] : []),
          ],
        },
        select: {
          id: true,
          encryptionState: true,
        },
      });
      const encrypted = existing?.encryptionState === "encrypted";
      const data = {
        ...(encrypted
          ? {}
          : {
              title: mapped.title,
              description: mapped.description,
              location: mapped.location,
            }),
        start: mapped.start,
        end: mapped.end,
        allDay: mapped.allDay,
        timezone: mapped.timezone,
        recurrence: mapped.recurrence,
        ...(encrypted && mapped.reminder == null
          ? {}
          : { reminder: mapped.reminder }),
        calendarId,
        externalId: mapped.stalwartUid,
        stalwartAccountId: input.accountId,
        stalwartCalendarId: mapped.stalwartCalendarId,
        stalwartEventId: mapped.stalwartEventId,
        stalwartUid: mapped.stalwartUid,
        stalwartSyncedAt: new Date(),
      };

      let localEventId = existing?.id;
      if (existing) {
        await this.prisma.calendarEvent.update({
          where: { id: existing.id },
          data,
        });
      } else {
        const createdEvent = await this.prisma.calendarEvent.create({
          data: {
            ...data,
            title: mapped.title,
            description: mapped.description,
            location: mapped.location,
            color: null,
            categoryId: null,
            userId: input.userId,
          },
        });
        localEventId = createdEvent.id;
      }

      if (localEventId) {
        const syncedParticipants =
          await this.eventParticipantService.syncParticipants({
            eventId: localEventId,
            participants: mapStalwartParticipantsToSolace(
              remoteEvent.participants,
            ),
            tx: this.prisma,
          });
        await syncedParticipants.sendPendingInvitations();
      }
    }
  }

  private async buildParticipantMap(eventIds: string[]) {
    if (eventIds.length === 0) {
      return new Map<string, ReturnType<typeof mapEventParticipant>[]>();
    }

    const participants: EventParticipantRecord[] =
      await this.prisma.eventParticipant.findMany({
        where: {
          eventId: { in: eventIds },
        },
        include: {
          user: { select: EVENT_PARTICIPANT_USER_SELECT },
        },
      });

    const participantMap = new Map<
      string,
      ReturnType<typeof mapEventParticipant>[]
    >();
    for (const participant of participants) {
      const eventParticipants = participantMap.get(participant.eventId) ?? [];
      eventParticipants.push(
        mapEventParticipant(participant as EventParticipantRecord),
      );
      participantMap.set(participant.eventId, eventParticipants);
    }

    for (const [eventId, eventParticipants] of participantMap) {
      participantMap.set(eventId, sortEventParticipants(eventParticipants));
    }

    return participantMap;
  }

  private shouldHideDeclinedInvitationEvent(
    userId: string,
    participants: ReturnType<typeof mapEventParticipant>[] | null | undefined,
  ): boolean {
    const participant = participants?.find(
      (entry) => entry.userId === userId && entry.role !== "organizer",
    );
    return participant?.status === "declined";
  }

  private isAttendeeCopyForUser(
    userId: string,
    participants:
      | Array<{
          userId?: string | null;
          role?: string | null;
        }>
      | null
      | undefined,
  ): boolean {
    const participant = participants?.find((entry) => entry.userId === userId);
    return participant?.role === "attendee";
  }

  private isAttendeeImportedInvitationForUser(
    userId: string,
    event: {
      externalId?: string | null;
      participants?:
        | Array<{
            userId?: string | null;
            role?: string | null;
          }>
        | null;
    },
  ): boolean {
    return (
      Boolean(event.externalId?.trim()) &&
      this.isAttendeeCopyForUser(userId, event.participants)
    );
  }

  private async purgeInvitationEventRecord(eventId: string): Promise<void> {
    const eventIdFilter = prismaStringEquals(eventId, "eventId");
    await this.prisma.eventNotification.deleteMany({
      where: { eventId: eventIdFilter },
    });
    await this.prisma.notificationLog.deleteMany({
      where: { eventId: eventIdFilter },
    });
    await this.prisma.calendarEvent.delete({
      where: { id: eventIdFilter.equals },
    });
  }

  private async attachParticipantsToSearchEvents(
    events: Record<string, unknown>[],
    userId: string,
  ) {
    const eventIds: string[] = [];
    for (const event of events) {
      if (typeof event.id === "string" && event.id) {
        eventIds.push(event.id);
      }
    }
    const participantMap = await this.buildParticipantMap(eventIds);

    return events.reduce<Record<string, unknown>[]>((acc, event) => {
      const participants =
        typeof event.id === "string"
          ? (participantMap.get(event.id) ?? [])
          : [];
      if (
        this.shouldHideDeclinedInvitationEvent(
          userId,
          participants as ReturnType<typeof mapEventParticipant>[],
        )
      ) {
        return acc;
      }
      acc.push({ ...event, participants });
      return acc;
    }, []);
  }

  private buildInvitationEventPayload(input: {
    eventId: string;
    externalId?: string | null;
    title: string;
    description?: string | null;
    start: Date;
    end: Date;
    allDay: boolean;
    timezone: string;
    location?: string | null;
    recurrence?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }): IcsBuildEventInput {
    const parsedRecurrence = input.recurrence
      ? RecurrenceEngine.parseRecurrenceRule(input.recurrence)
      : null;

    return {
      uid: input.externalId || `${input.eventId}@solace-calendar.local`,
      title: input.title,
      description: input.description ?? null,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
      timezone: input.timezone,
      location: input.location ?? null,
      recurrence: parsedRecurrence
        ? {
            frequency: parsedRecurrence.frequency,
            interval: parsedRecurrence.interval,
            count: parsedRecurrence.count,
            until: parsedRecurrence.until?.toISOString(),
            timezone: parsedRecurrence.timezone,
            byWeekDay: parsedRecurrence.byWeekDay,
            byMonthDay: parsedRecurrence.byMonthDay,
            byMonth: parsedRecurrence.byMonth,
          }
        : undefined,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
  }

  async search(
    input: EventSearchInput,
  ): Promise<{ events: unknown[]; total: number }> {
    const {
      userId,
      query: q,
      blindIndexTokens,
      limit,
      offset,
      startDate,
      endDate,
    } = input;
    const searchQuery = q?.trim();
    const normalizedBlindIndexTokens = (blindIndexTokens || []).filter(Boolean);

    if (
      (!searchQuery || searchQuery.length < 2) &&
      normalizedBlindIndexTokens.length === 0
    ) {
      return { events: [], total: 0 };
    }

    const hasPlaintextSearch = Boolean(searchQuery);
    const plaintextSearchVector =
      "to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.description, '') || ' ' || coalesce(e.location, ''))";
    const plaintextSearchFilter = hasPlaintextSearch
      ? `${plaintextSearchVector}
          @@ plainto_tsquery('english', $2)
          OR e.title ILIKE '%' || $2 || '%'`
      : "FALSE";
    const rankExpression = hasPlaintextSearch
      ? `ts_rank(
          ${plaintextSearchVector},
          plainto_tsquery('english', $2)
        )`
      : "0";

    const limitVal = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const offsetVal = Math.max(Number(offset) || 0, 0);

    const params: (string | number | Date)[] = [userId, searchQuery || ""];
    let blindIndexFilter = "";
    if (normalizedBlindIndexTokens.length > 0) {
      const tokenPlaceholders = normalizedBlindIndexTokens.map(
        (_, index) => `$${params.length + index + 1}`,
      );
      blindIndexFilter = `
          OR (
            e.blind_index_tokens IS NOT NULL
            AND e.blind_index_tokens::jsonb ?| ARRAY[${tokenPlaceholders.join(", ")}]
          )`;
      params.push(...normalizedBlindIndexTokens);
    }

    let dateFilter = "";
    if (startDate && endDate) {
      dateFilter = `AND e.start <= $${params.length + 1}::timestamp AND e.end >= $${params.length + 2}::timestamp`;
      params.push(new Date(startDate), new Date(endDate));
    }

    const countParams = [...params];
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;
    params.push(limitVal, offsetVal);

    const results = await this.prisma.$queryRawUnsafe(
      `SELECT
        e.id, e.title, e.description, e.start, e.end, e.all_day, e.location, e.color,
        e.calendar_id, e.category_id, e.timezone, e.recurrence, e.user_id,
        e.created_at, e.updated_at, e.encrypted_content, e.blind_index_tokens,
        e.encryption_state, e.encryption_key_version,
        c.id as "calendar.id", c.name as "calendar.name", c.color as "calendar.color",
        cat.id as "category.id", cat.name as "category.name", cat.color as "category.color",
        ${rankExpression} as rank
      FROM calendar_event e
      LEFT JOIN calendar c ON e.calendar_id = c.id
      LEFT JOIN event_category cat ON e.category_id = cat.id
      WHERE e.user_id = $1
        AND (
          ${plaintextSearchFilter}
          ${blindIndexFilter}
        )
        ${dateFilter}
      ORDER BY rank DESC, e.start DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
      ...params,
    );

    const countResult = await this.prisma.$queryRawUnsafe(
      `SELECT count(*)::int as total
      FROM calendar_event e
      WHERE e.user_id = $1
        AND (
          ${plaintextSearchFilter}
          ${blindIndexFilter}
        )
        ${dateFilter}`,
      ...countParams,
    );

    const total = (countResult as { total: number }[])?.[0]?.total ?? 0;

    const events = await this.attachParticipantsToSearchEvents(
      (results as Record<string, unknown>[]).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        start: row.start,
        end: row.end,
        allDay: row.all_day,
        location: row.location,
        color: row.color,
        timezone: row.timezone,
        recurrence: row.recurrence,
        encryptedContent: row.encrypted_content,
        blindIndexTokens: row.blind_index_tokens,
        encryptionState: row.encryption_state,
        encryptionKeyVersion: row.encryption_key_version,
        calendarId: row.calendar_id,
        categoryId: row.category_id,
        userId: row.user_id,
        calendar: row["calendar.id"]
          ? {
              id: row["calendar.id"],
              name: row["calendar.name"],
              color: row["calendar.color"],
            }
          : null,
        category: row["category.id"]
          ? {
              id: row["category.id"],
              name: row["category.name"],
              color: row["category.color"],
            }
          : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      userId,
    );

    return { events, total };
  }

  async searchCorpus(
    input: EventSearchCorpusInput,
  ): Promise<{ events: unknown[]; total: number; nextOffset: number | null }> {
    const limit = Math.min(Math.max(Number(input.limit) || 100, 1), 200);
    const offset = Math.max(Number(input.offset) || 0, 0);
    const updatedAfter = input.updatedAfter
      ? new Date(input.updatedAfter)
      : null;

    if (updatedAfter && Number.isNaN(updatedAfter.getTime())) {
      throw new ValidationError(
        "Invalid updatedAfter date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
      );
    }

    const where = {
      userId: input.userId,
      ...(updatedAfter ? { updatedAt: { gt: updatedAfter } } : {}),
      NOT: {
        participants: {
          some: {
            userId: input.userId,
            role: { not: "organizer" },
            status: "declined",
          },
        },
      },
    };

    const [events, total] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where,
        include: EVENT_WITH_RELATIONS_INCLUDE,
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.calendarEvent.count({ where }),
    ]);

    const visibleEvents = events.map((event) => ({
      ...event,
      participants: mapAndSortParticipants(event),
    }));

    const consumed = offset + events.length;

    return {
      events: visibleEvents,
      total,
      nextOffset: consumed < total ? consumed : null,
    };
  }

  async list(input: EventListInput): Promise<{
    events: unknown[];
    categories: unknown[];
    calendars: unknown[];
  }> {
    const { userId, start, end } = input;

    if (!this.initializedUsers.has(userId)) {
      await ensureUserCalendars(userId);
      this.initializedUsers.add(userId);

      if (this.initializedUsers.size > INITIALIZED_USER_CACHE_LIMIT) {
        // Keep memory bounded in long-lived processes by evicting oldest inserted users.
        const oldestUserId = this.initializedUsers.values().next().value;
        if (oldestUserId) {
          this.initializedUsers.delete(oldestUserId);
        }
      }
    }

    if (!start || !end) {
      throw new ValidationError("Start and end date parameters are required");
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime())) {
      throw new ValidationError(
        "Invalid start date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
      );
    }

    if (isNaN(endDate.getTime())) {
      throw new ValidationError(
        "Invalid end date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
      );
    }

    if (startDate >= endDate) {
      throw new ValidationError("End date must be after start date");
    }

    const stalwartAccountId = await this.getStalwartAccountId(userId);
    if (stalwartAccountId) {
      this.scheduleStalwartEventsSync({
        userId,
        accountId: stalwartAccountId,
        startDate,
        endDate,
      });
    }

    const [regularEvents, recurringEvents] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          userId,
          recurrence: null,
          OR: [
            {
              start: { gte: startDate, lte: endDate },
            },
            {
              end: { gte: startDate, lte: endDate },
            },
            {
              start: { lte: startDate },
              end: { gte: endDate },
            },
          ],
        },
        include: EVENT_WITH_RELATIONS_INCLUDE,
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          userId,
          recurrence: { not: null },
          parentEventId: null,
        },
        include: EVENT_WITH_RECURRENCE_INCLUDE,
      }),
    ]);

    const recurringInstances = [];
    for (const recurringEvent of recurringEvents) {
      try {
        let recurrenceRule = recurringEvent.recurrence || "{}";
        const parsedRule = RecurrenceEngine.parseRecurrenceRule(recurrenceRule);
        const titleLower = recurringEvent.title.toLowerCase();
        const duration =
          recurringEvent.end.getTime() - recurringEvent.start.getTime();

        // Fallback: infer weekday recurrence from title keywords when rule is empty
        if (
          !parsedRule &&
          (titleLower.includes("standup") || titleLower.includes("daily"))
        ) {
          recurrenceRule = JSON.stringify({
            frequency: "daily",
            interval: 1,
            byWeekDay: [1, 2, 3, 4, 5],
          });
        }

        const exceptions = recurringEvent.recurrenceExceptions.map((ex) => ({
          exceptionDate: ex.exceptionDate,
          type: ex.type as "modified" | "deleted",
        }));

        const instances = RecurrenceEngine.generateInstances(
          {
            id: recurringEvent.id,
            start: recurringEvent.start,
            end: recurringEvent.end,
            recurrence: recurrenceRule,
          },
          startDate,
          endDate,
          exceptions,
        );

        for (const instance of instances) {
          if (!instance.isOriginal) {
            recurringInstances.push({
              ...recurringEvent,
              id: `${recurringEvent.id}_${instance.date.toISOString()}`,
              start: instance.date,
              end: new Date(instance.date.getTime() + duration),
              parentEventId: recurringEvent.id,
              isRecurringInstance: true,
            });
          } else if (
            instance.isOriginal &&
            instance.date >= startDate &&
            instance.date <= endDate
          ) {
            recurringInstances.push({
              ...recurringEvent,
              isRecurringInstance: false,
            });
          }
        }
      } catch (error) {
        logger.error(
          `Error generating instances for event ${recurringEvent.id}`,
          errorLogDetails(error),
        );
        if (
          recurringEvent.start >= startDate &&
          recurringEvent.start <= endDate
        ) {
          recurringInstances.push({
            ...recurringEvent,
            isRecurringInstance: false,
          });
        }
      }
    }

    const [modifiedInstances, categories, calendars] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          userId,
          parentEventId: { not: null },
          start: { gte: startDate, lte: endDate },
        },
        include: EVENT_WITH_RELATIONS_INCLUDE,
      }),
      this.prisma.eventCategory.findMany({
        where: {
          userId,
          isActive: true,
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.calendar.findMany({
        where: {
          userId,
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
    ]);

    const events = [];
    for (const event of [
      ...regularEvents,
      ...recurringInstances,
      ...modifiedInstances,
    ]) {
      const participants = mapAndSortParticipants(event);
      if (this.shouldHideDeclinedInvitationEvent(userId, participants)) {
        continue;
      }
      events.push({ ...event, participants });
    }
    events.sort((a, b) => a.start.getTime() - b.start.getTime());

    return {
      events,
      categories,
      calendars,
    };
  }

  async getById(userId: string, eventId: string): Promise<unknown> {
    try {
      const include = {
        category: true,
        calendar: true,
        participants: {
          include: {
            user: {
              select: EVENT_PARTICIPANT_USER_SELECT,
            },
          },
        },
      };

      let event = await this.prisma.calendarEvent.findFirst({
        where: {
          id: eventId,
          userId,
        },
        include,
      });

      if (!event && eventId.includes("_")) {
        const parentEventId = eventId.split("_")[0];
        event = await this.prisma.calendarEvent.findFirst({
          where: {
            id: parentEventId,
            userId,
          },
          include,
        });
      }

      if (!event) {
        throw new ValidationError("Event not found or access denied");
      }

      if (
        this.stalwartClient &&
        event.stalwartAccountId &&
        event.stalwartEventId
      ) {
        await this.syncStalwartEventsByIds({
          userId,
          accountId: event.stalwartAccountId,
          eventIds: [event.stalwartEventId],
        });
        event = await this.prisma.calendarEvent.findFirst({
          where: {
            id: event.id,
            userId,
          },
          include,
        });
      }

      if (!event) {
        throw new ValidationError("Event not found or access denied");
      }

      return {
        ...event,
        participants: mapAndSortParticipants(event),
      };
    } catch (error) {
      logger.error("Event fetch error", errorLogDetails(error));
      throw error;
    }
  }

  async getInvitationByExternalId(
    userId: string,
    externalId: string,
    options: { syncRemote?: boolean } = {},
  ): Promise<unknown | null> {
    const normalizedExternalId = externalId.trim();
    if (!normalizedExternalId) {
      throw new ValidationError("External event id is required", "externalId");
    }

    const syncRemote = options.syncRemote ?? true;
    const stalwartAccountId = await this.getStalwartAccountId(userId);
    if (syncRemote && stalwartAccountId) {
      await this.syncStalwartEventByUid({
        userId,
        accountId: stalwartAccountId,
        uid: normalizedExternalId,
      });
    }

    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        userId,
        externalId: normalizedExternalId,
        subscriptionId: null,
      },
      include: EVENT_WITH_RELATIONS_INCLUDE,
    });

    if (!event) {
      return null;
    }

    return {
      ...event,
      participants: mapAndSortParticipants(event),
    };
  }

  async sealEncryption(input: {
    userId: string;
    eventId: string;
    encryptedContent: string;
    blindIndexTokens?: string[];
    encryptionKeyVersion?: number;
  }): Promise<unknown> {
    if (!this.hasEncryptedPayload(input.encryptedContent)) {
      throw new ValidationError(
        "Encrypted content payload is required.",
        "encryptedContent",
      );
    }

    const existingEvent = await this.prisma.calendarEvent.findFirst({
      where: {
        id: input.eventId,
        userId: input.userId,
      },
      include: EVENT_WITH_RELATIONS_INCLUDE,
    });

    if (!existingEvent) {
      throw new ValidationError("Event not found or access denied");
    }

    if (existingEvent.isSynced) {
      throw new ValidationError(
        "Cannot seal encryption for synced subscription events.",
      );
    }

    if (existingEvent.encryptionState === "encrypted") {
      return {
        ...existingEvent,
        participants: mapAndSortParticipants(existingEvent),
      };
    }

    const persistencePolicy = resolveEventPersistencePolicy({
      hasEncryptedPayload: true,
      title: existingEvent.title,
      description: existingEvent.description,
      location: existingEvent.location,
    });

    const updatedEvent = await this.prisma.calendarEvent.update({
      where: { id: existingEvent.id },
      data: {
        title: persistencePolicy.title,
        description: persistencePolicy.description,
        location: persistencePolicy.location,
        encryptedContent: input.encryptedContent,
        ...(input.blindIndexTokens !== undefined
          ? { blindIndexTokens: JSON.stringify(input.blindIndexTokens) }
          : {}),
        encryptionState: persistencePolicy.encryptionState,
        encryptionKeyVersion: input.encryptionKeyVersion ?? 1,
      },
      include: EVENT_WITH_RELATIONS_INCLUDE,
    });

    return {
      ...updatedEvent,
      participants: mapAndSortParticipants(updatedEvent),
    };
  }

  async respondToInvitation(input: {
    userId: string;
    eventId: string;
    status: Exclude<EventParticipantStatus, "pending">;
  }): Promise<unknown> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    const userEmail = user?.email?.trim().toLowerCase() ?? null;

    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id: input.eventId,
        userId: input.userId,
        subscriptionId: null,
      },
      include: EVENT_WITH_RELATIONS_INCLUDE,
    });

    if (!event) {
      throw new ValidationError("Event not found or access denied");
    }

    const attendee = event.participants.find((participant) => {
      const participantEmail = participant.email?.trim().toLowerCase();
      return (
        participant.role !== "organizer" &&
        (participant.userId === input.userId ||
          (userEmail && participantEmail === userEmail))
      );
    });

    if (!attendee) {
      throw new ValidationError(
        "This event does not have an attendee invitation for your account.",
        "eventId",
      );
    }

    const targetCalendar =
      input.status === "declined"
        ? null
        : await resolveAcceptedInvitationTargetCalendar(
            this.prisma,
            input.userId,
          );
    const shouldMoveToTargetCalendar =
      targetCalendar !== null && event.calendarId !== targetCalendar.id;

    const nextParticipants = event.participants.map((participant) => ({
      email: participant.email,
      displayName: participant.displayName ?? undefined,
      role: participant.role as "organizer" | "attendee",
      status:
        participant.id === attendee.id
          ? input.status
          : (participant.status as EventParticipantStatus),
    }));

    if (shouldMoveToTargetCalendar && targetCalendar) {
      await this.prisma.calendarEvent.update({
        where: { id: event.id },
        data: {
          calendarId: targetCalendar.id,
          stalwartAccountId:
            targetCalendar.stalwartAccountId ?? event.stalwartAccountId,
          stalwartCalendarId:
            targetCalendar.stalwartCalendarId ?? event.stalwartCalendarId,
        },
      });
    }

    const stalwartCalendarId =
      targetCalendar?.stalwartCalendarId ?? event.stalwartCalendarId;
    const stalwartAccountId =
      targetCalendar?.stalwartAccountId ??
      event.stalwartAccountId ??
      (await this.getStalwartAccountId(input.userId));
    const eventUid =
      event.stalwartUid ||
      event.externalId ||
      `${event.id}@solace-calendar.local`;
    const remotePayload = buildStalwartEventPayload({
      calendarId: stalwartCalendarId ?? "",
      uid: eventUid,
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      timezone: resolveTimezone(event.timezone),
      location: event.location,
      recurrence: event.recurrence,
      reminder: event.reminder,
      participants: nextParticipants,
    });

    if (
      this.stalwartClient &&
      stalwartAccountId &&
      stalwartCalendarId &&
      event.stalwartEventId
    ) {
      await this.stalwartClient.updateEvent({
        accountId: stalwartAccountId,
        eventId: event.stalwartEventId,
        patch: remotePayload,
        sendSchedulingMessages: true,
      });

      if (input.status === "declined") {
        // Remove the event from the Stalwart calendar after sending the DECLINED iTIP reply
        await this.stalwartClient.deleteEvent({
          accountId: stalwartAccountId,
          eventId: event.stalwartEventId,
        });
      } else {
        await this.syncStalwartEventsByIds({
          userId: input.userId,
          accountId: stalwartAccountId,
          eventIds: [event.stalwartEventId],
        });
      }
    } else if (this.stalwartClient && stalwartAccountId && stalwartCalendarId) {
      const remoteEvent = await this.stalwartClient.createEvent({
        accountId: stalwartAccountId,
        event: remotePayload,
        sendSchedulingMessages: true,
      });

      if (input.status === "declined") {
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
            ...errorLogDetails(error),
          });
        }
      } else {
        await this.prisma.calendarEvent.update({
          where: { id: event.id },
          data: {
            stalwartAccountId,
            stalwartCalendarId,
            stalwartEventId: remoteEvent.id,
            stalwartUid: eventUid,
            stalwartSyncedAt: new Date(),
          },
        });
        await this.syncStalwartEventsByIds({
          userId: input.userId,
          accountId: stalwartAccountId,
          eventIds: [remoteEvent.id],
        });
      }
    } else {
      await this.prisma.eventParticipant.update({
        where: { id: attendee.id },
        data: { status: input.status },
      });
    }

    // When declining, keep a hidden tombstone so mailed invites are not re-staged.
    if (input.status === "declined") {
      await this.prisma.eventNotification.deleteMany({
        where: { eventId: input.eventId },
      });
      await this.prisma.notificationLog.deleteMany({
        where: { eventId: input.eventId },
      });

      const stagingCalendar = await resolveInvitationStagingCalendar(
        this.prisma,
        input.userId,
      );

      await this.prisma.eventParticipant.update({
        where: { id: attendee.id },
        data: { status: "declined" },
      });

      await this.prisma.calendarEvent.update({
        where: { id: input.eventId },
        data: {
          calendarId: stagingCalendar.id,
          stalwartEventId: null,
          stalwartSyncedAt: null,
        },
      });

      return { deleted: true as const };
    }

    const updatedEvent = await this.prisma.calendarEvent.findFirst({
      where: {
        id: input.eventId,
        userId: input.userId,
      },
      include: EVENT_WITH_RELATIONS_INCLUDE,
    });

    if (!updatedEvent) {
      throw new ValidationError("Event not found or access denied");
    }

    return {
      ...updatedEvent,
      participants: mapAndSortParticipants(updatedEvent),
    };
  }

  async create(input: EventCreateInput): Promise<EventMutationResult> {
    try {
      const {
        userId,
        title,
        start,
        end,
        description,
        allDay,
        location,
        color,
        calendarId,
        categoryId,
        timezone,
        recurrence,
        encryptedContent,
        blindIndexTokens,
        encryptionKeyVersion,
        participants,
      } = input;
      let { reminder } = input;

      if (!title?.trim()) {
        throw new ValidationError(
          "Title is required and cannot be empty",
          "title",
        );
      }

      if (!start) {
        throw new ValidationError("Start date is required", "start");
      }

      if (!end) {
        throw new ValidationError("End date is required", "end");
      }

      const startDate = new Date(start);
      const endDate = new Date(end);

      if (isNaN(startDate.getTime())) {
        throw new ValidationError(
          "Invalid start date format. Use ISO 8601 format",
          "start",
        );
      }

      if (isNaN(endDate.getTime())) {
        throw new ValidationError(
          "Invalid end date format. Use ISO 8601 format",
          "end",
        );
      }

      if (startDate >= endDate) {
        throw new ValidationError("End time must be after start time", "end");
      }

      if (color) {
        if (!isValidCalendarColor(color)) {
          throw new ValidationError(
            `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
            "color",
          );
        }
      }

      // Don't normalize all-day boundaries here — the client sends them in the
      // user's timezone and re-applying setHours() on the server would shift dates.

      if (recurrence) {
        try {
          const rule = RecurrenceEngine.parseRecurrenceRule(recurrence);
          if (!rule) {
            throw new ValidationError(
              "Invalid recurrence rule format",
              "recurrence",
            );
          }

          const errors = RecurrenceEngine.validateRecurrenceRule(rule);
          if (errors.length > 0) {
            throw new ValidationError(
              `Recurrence rule validation failed: ${errors.join(", ")}`,
              "recurrence",
            );
          }
        } catch (recurrenceError) {
          logger.error("Recurrence validation error", errorLogDetails(recurrenceError));
          throw new ValidationError(
            "Invalid recurrence rule format",
            "recurrence",
          );
        }
      }

      if (categoryId) {
        const category = await this.prisma.eventCategory.findFirst({
          where: {
            id: categoryId,
            userId,
            isActive: true,
          },
        });

        if (!category) {
          throw new ValidationError(
            "Invalid category or category does not belong to user",
            "categoryId",
          );
        }
      }

      if (title.trim().length > 0) {
        validateEventTitleLength(title);
      }

      validateEventDescriptionLength(description);
      validateEventLocationLength(location);

      if (!calendarId) {
        throw new ValidationError("Calendar ID is required", "calendarId");
      }

      const calendar = await findUserCalendarOrThrow(
        this.prisma,
        userId,
        calendarId,
      );

      assertCalendarWritable(
        calendar,
        "Cannot create events in a read-only calendar. This calendar is managed by a subscription or public feed.",
      );

      if (reminder !== undefined && reminder !== null) {
        reminder = validateEventReminderMinutes(reminder) as typeof reminder;
      }

      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: {
          timezone: true,
          emailNotifications: true,
          pushNotifications: true,
        },
      });
      const eventTimezone = resolveTimezone(timezone ?? userSettings?.timezone);

      const hasEncryptedPayload = this.hasEncryptedPayload(encryptedContent);

      if (isCalendarWritable(calendar) && !hasEncryptedPayload) {
        throw new ValidationError(
          "Event encryption requires an active encryption session.",
          "encryptedContent",
        );
      }

      const persistencePolicy = resolveEventPersistencePolicy({
        hasEncryptedPayload,
        title,
        description,
        location,
      });

      const stalwartAccountId = await this.getStalwartAccountId(userId);
      const stalwartCalendarId = stalwartAccountId
        ? await this.ensureRemoteCalendar({
            accountId: stalwartAccountId,
            calendar,
          })
        : null;
      const stalwartUid = `${crypto.randomUUID()}@solace-calendar.local`;
      let stalwartEventId: string | null = null;

      if (this.stalwartClient && stalwartAccountId && stalwartCalendarId) {
        const remoteEvent = await this.stalwartClient.createEvent({
          accountId: stalwartAccountId,
          sendSchedulingMessages: false,
          event: buildStalwartEventPayload({
            calendarId: stalwartCalendarId,
            uid: stalwartUid,
            title: persistencePolicy.title || title,
            description: persistencePolicy.description,
            start: startDate,
            end: endDate,
            allDay: allDay || false,
            timezone: eventTimezone,
            location: persistencePolicy.location,
            recurrence: recurrence || null,
            reminder: reminder ?? null,
            participants: await this.resolveStalwartParticipants(
              userId,
              participants ?? [],
            ),
          }),
        });
        stalwartEventId = remoteEvent.id;
      }

      let event;
      try {
        event = await this.prisma.calendarEvent.create({
          data: {
            title: persistencePolicy.title,
            description: persistencePolicy.description,
            ...(encryptedContent !== undefined ? { encryptedContent } : {}),
            ...(blindIndexTokens !== undefined
              ? { blindIndexTokens: JSON.stringify(blindIndexTokens) }
              : {}),
            encryptionState: persistencePolicy.encryptionState,
            ...(encryptionKeyVersion !== undefined
              ? { encryptionKeyVersion }
              : {}),
            start: startDate,
            end: endDate,
            timezone: eventTimezone,
            allDay: allDay || false,
            location: persistencePolicy.location,
            color: color || null,
            calendarId,
            categoryId: categoryId || null,
            reminder: reminder ?? null,
            recurrence: recurrence || null,
            userId,
            externalId: stalwartUid,
            stalwartAccountId,
            stalwartCalendarId,
            stalwartEventId,
            stalwartUid,
            stalwartSyncedAt: stalwartEventId ? new Date() : null,
          },
          include: {
            category: true,
            calendar: true,
          },
        });
      } catch (error) {
        if (this.stalwartClient && stalwartAccountId && stalwartEventId) {
          try {
            await this.stalwartClient.deleteEvent({
              accountId: stalwartAccountId,
              eventId: stalwartEventId,
              sendSchedulingMessages: false,
            });
          } catch (cleanupError) {
            logger.error("Failed to clean up remote event after local DB create failure", {
              stalwartEventId,
              ...errorLogDetails(error),
              cleanupError: errorLogDetails(cleanupError),
            });
          }
        }
        throw error;
      }

      const participantResult =
        await this.eventParticipantService.syncParticipants({
          eventId: event.id,
          participants: participants ?? [],
          ownerUserId: userId,
          sendInvitations: true,
          calendarName: calendar.name,
          invitationEvent: this.buildInvitationEventPayload({
            eventId: event.id,
            externalId: event.externalId,
            title: title.trim(),
            description: description?.trim() || null,
            start: startDate,
            end: endDate,
            allDay: allDay || false,
            timezone: eventTimezone,
            location: location?.trim() || null,
            recurrence: recurrence || null,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          }),
        });
      const invitationWarnings = await participantResult.sendPendingInvitations();

      const warnings: OperationWarning[] = [...invitationWarnings];

      try {
        if (reminder && reminder > 0) {
          if (shouldScheduleEventReminder(userSettings)) {
            const reminderDisplayTitle = firstNotificationDisplayTitle(title);
            const created = await this.insertUpcomingEventReminder({
              eventId: event.id,
              eventStart: startDate,
              minutesBefore: reminder,
              timezone: eventTimezone,
              displayTitle: reminderDisplayTitle,
            });
            if (created) {
              logger.ok(`Created notification for event ${event.id}`);
            } else {
              logger.info(
                `Skipping creating past notification for event ${event.id}`,
              );
            }
          }
        }
      } catch (notificationError) {
        logger.error("Failed to create notifications", errorLogDetails(notificationError));
        warnings.push(reminderScheduleWarning("create"));
      }

      return {
        ...event,
        participants: participantResult.participants,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    } catch (error) {
      logger.error("Event creation error", errorLogDetails(error));
      throw error;
    }
  }

  async update(input: EventUpdateInput): Promise<EventMutationResult> {
    try {
      const { userId, eventId: requestedId } = input;

      let id = requestedId;
      if (
        id.includes("_") &&
        id.match(/_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      ) {
        const parentEventId = id.split("_")[0]!;
        logger.info(
          `Redirecting edit request from instance ${id} to parent ${parentEventId}`,
        );
        id = parentEventId;
      }

      const existingEvent = await this.prisma.calendarEvent.findFirst({
        where: {
          id,
          userId,
        },
        include: { category: true, participants: true },
      });

      if (!existingEvent) {
        throw new ValidationError("Event not found or access denied");
      }

      if (existingEvent.isSynced) {
        throw new ValidationError(
          "Cannot edit synced events. Synced events are read-only.",
        );
      }

      if (
        this.isAttendeeCopyForUser(userId, existingEvent.participants) &&
        !existingEvent.isCancelled
      ) {
        throw new ValidationError(
          "Imported invitation events are read-only for attendees.",
        );
      }

      // Validate dates if provided
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (input.start) {
        startDate = new Date(input.start);
        if (isNaN(startDate.getTime())) {
          throw new ValidationError(
            "Invalid start date format. Use ISO 8601 format",
            "start",
          );
        }
      }

      if (input.end) {
        endDate = new Date(input.end);
        if (isNaN(endDate.getTime())) {
          throw new ValidationError(
            "Invalid end date format. Use ISO 8601 format",
            "end",
          );
        }
      }

      const finalStartDate = startDate || existingEvent.start;
      const finalEndDate = endDate || existingEvent.end;

      // Don't normalize all-day boundaries — same reasoning as create().

      if (finalStartDate >= finalEndDate) {
        throw new ValidationError("End time must be after start time", "end");
      }

      if (input.title !== undefined && !input.title?.trim()) {
        throw new ValidationError(
          "Title is required and cannot be empty",
          "title",
        );
      }

      const reminderValue = validateOptionalEventFields({
        title: input.title,
        description: input.description,
        location: input.location,
        reminder: input.reminder,
      });

      if (input.color !== undefined && input.color) {
        if (!isValidCalendarColor(input.color)) {
          throw new ValidationError(
            `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
            "color",
          );
        }
      }

      let targetCalendar = null;
      if (input.calendarId !== undefined) {
        targetCalendar = await findUserCalendarOrThrow(
          this.prisma,
          userId,
          input.calendarId,
        );
        assertCalendarWritable(
          targetCalendar,
          "Cannot move events to a read-only calendar.",
        );
      }

      if (input.categoryId !== undefined && input.categoryId) {
        const category = await this.prisma.eventCategory.findFirst({
          where: {
            id: input.categoryId,
            userId,
            isActive: true,
          },
        });

        if (!category) {
          throw new ValidationError(
            "Invalid category or category does not belong to user",
            "categoryId",
          );
        }
      }

      const finalCalendar =
        targetCalendar ||
        (await this.prisma.calendar.findFirst({
          where: {
            id: existingEvent.calendarId,
            userId,
          },
          select: {
            id: true,
            name: true,
            color: true,
            kind: true,
            isSyncOnly: true,
            isVisible: true,
            isDefault: true,
            icsShareEnabled: true,
            forceFullEncryption: true,
            stalwartCalendarId: true,
          },
        }));

      if (!finalCalendar) {
        throw new ValidationError(
          "Invalid calendar or calendar does not belong to user",
          "calendarId",
        );
      }

      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: {
          timezone: true,
          emailNotifications: true,
          pushNotifications: true,
        },
      });
      const eventTimezone =
        input.timezone !== undefined
          ? resolveTimezone(input.timezone ?? userSettings?.timezone)
          : existingEvent.timezone;

      const existingHasEncryptedPayload = this.hasEncryptedPayload(
        existingEvent.encryptedContent,
      );
      const finalEncryptedContent =
        input.encryptedContent !== undefined
          ? input.encryptedContent
          : existingEvent.encryptedContent;
      const hasEncryptedPayload = this.hasEncryptedPayload(
        finalEncryptedContent,
      );
      const sensitiveFieldsProvided =
        input.title !== undefined ||
        input.description !== undefined ||
        input.location !== undefined;
      const writableCalendar = isCalendarWritable(finalCalendar);

      if (
        sensitiveFieldsProvided &&
        input.encryptedContent === undefined &&
        (existingHasEncryptedPayload || writableCalendar)
      ) {
        throw new ValidationError(
          "Encrypted content payload is required when updating protected event fields.",
          "encryptedContent",
        );
      }

      if (writableCalendar && !hasEncryptedPayload && !existingEvent.isSynced) {
        throw new ValidationError(
          "Event encryption requires an active encryption session.",
          "encryptedContent",
        );
      }

      const nextTitle =
        input.title !== undefined ? input.title.trim() : existingEvent.title;
      const nextDescription =
        input.description !== undefined
          ? input.description?.trim() || null
          : existingEvent.description;
      const nextLocation =
        input.location !== undefined
          ? input.location?.trim() || null
          : existingEvent.location;
      const finalReminderValue =
        input.reminder !== undefined
          ? (reminderValue ?? null)
          : existingEvent.reminder;
      const persistencePolicy = resolveEventPersistencePolicy({
        hasEncryptedPayload,
        title: nextTitle,
        description: nextDescription,
        location: nextLocation,
      });

      const updateData: Record<string, unknown> = {};

      updateData.title = persistencePolicy.title;
      updateData.description = persistencePolicy.description;
      if (startDate) {
        updateData.start = finalStartDate;
      }
      if (endDate) {
        updateData.end = finalEndDate;
      }
      if (input.allDay !== undefined) {
        updateData.allDay = input.allDay;
      }
      if (input.timezone !== undefined) {
        updateData.timezone = eventTimezone;
      }
      updateData.location = persistencePolicy.location;
      if (input.color !== undefined) {
        updateData.color = input.color || null;
      }
      if (input.calendarId !== undefined) {
        updateData.calendarId = input.calendarId;
      }
      if (input.categoryId !== undefined) {
        updateData.categoryId = input.categoryId || null;
      }
      if (input.reminder !== undefined) {
        updateData.reminder = reminderValue ?? null;
      }
      if (input.recurrence !== undefined) {
        if (input.recurrence) {
          try {
            const rule = RecurrenceEngine.parseRecurrenceRule(input.recurrence);
            if (!rule) {
              throw new ValidationError(
                "Invalid recurrence rule format",
                "recurrence",
              );
            }

            const errors = RecurrenceEngine.validateRecurrenceRule(rule);
            if (errors.length > 0) {
              throw new ValidationError(
                `Recurrence rule validation failed: ${errors.join(", ")}`,
                "recurrence",
              );
            }
          } catch (recurrenceError) {
            logger.error("Recurrence validation error", errorLogDetails(recurrenceError));
            throw new ValidationError(
              "Invalid recurrence rule format",
              "recurrence",
            );
          }
        }
        updateData.recurrence = input.recurrence || null;
      }

      if (input.encryptedContent !== undefined) {
        updateData.encryptedContent = input.encryptedContent;
      }
      if (input.blindIndexTokens !== undefined) {
        updateData.blindIndexTokens = JSON.stringify(input.blindIndexTokens);
      }
      updateData.encryptionState = persistencePolicy.encryptionState;
      if (input.encryptionKeyVersion !== undefined) {
        updateData.encryptionKeyVersion = input.encryptionKeyVersion;
      }

      const stalwartAccountId =
        existingEvent.stalwartAccountId ??
        (await this.getStalwartAccountId(userId));
      const stalwartCalendarId = stalwartAccountId
        ? await this.ensureRemoteCalendar({
            accountId: stalwartAccountId,
            calendar: finalCalendar,
          })
        : null;
      let stalwartEventId = existingEvent.stalwartEventId;

      if (this.stalwartClient && stalwartAccountId && stalwartCalendarId) {
        const remotePayload = buildStalwartEventPayload({
          calendarId: stalwartCalendarId,
          uid:
            existingEvent.stalwartUid ||
            existingEvent.externalId ||
            `${existingEvent.id}@solace-calendar.local`,
          title: persistencePolicy.title || nextTitle,
          description: persistencePolicy.description,
          start: finalStartDate,
          end: finalEndDate,
          allDay:
            input.allDay !== undefined ? input.allDay : existingEvent.allDay,
          timezone: eventTimezone,
          location: persistencePolicy.location,
          recurrence:
            input.recurrence !== undefined
              ? input.recurrence
              : existingEvent.recurrence,
          reminder: finalReminderValue,
          participants:
            input.participants !== undefined
              ? await this.resolveStalwartParticipants(
                  userId,
                  input.participants,
                )
              : undefined,
        });

        if (stalwartEventId) {
          await this.stalwartClient.updateEvent({
            accountId: stalwartAccountId,
            eventId: stalwartEventId,
            sendSchedulingMessages: false,
            patch: remotePayload,
          });
        } else {
          const remoteEvent = await this.stalwartClient.createEvent({
            accountId: stalwartAccountId,
            sendSchedulingMessages: false,
            event: remotePayload,
          });
          stalwartEventId = remoteEvent.id;
        }
      }

      if (stalwartAccountId && stalwartCalendarId && stalwartEventId) {
        updateData.externalId =
          existingEvent.stalwartUid ||
          existingEvent.externalId ||
          `${existingEvent.id}@solace-calendar.local`;
        updateData.stalwartAccountId = stalwartAccountId;
        updateData.stalwartCalendarId = stalwartCalendarId;
        updateData.stalwartEventId = stalwartEventId;
        updateData.stalwartUid = updateData.externalId;
        updateData.stalwartSyncedAt = new Date();
      }

      updateData.updatedAt = new Date();

      const updatedEvent = await this.prisma.calendarEvent.update({
        where: {
          id,
          updatedAt: existingEvent.updatedAt,
        },
        data: updateData,
        include: {
          category: true,
          calendar: true,
        },
      });

      let invitationWarnings: OperationWarning[] = [];

      if (input.participants !== undefined) {
        const participantResult =
          await this.eventParticipantService.syncParticipants({
            eventId: updatedEvent.id,
            participants: input.participants,
            ownerUserId: userId,
            sendInvitations: true,
            calendarName: finalCalendar.name,
            // If the event is encrypted and the plaintext title isn't available in this
            // update, skip invitation emails (invitees would receive an empty-title ICS).
            invitationEvent: nextTitle
              ? this.buildInvitationEventPayload({
                  eventId: updatedEvent.id,
                  externalId: updatedEvent.externalId,
                  title: nextTitle,
                  description: nextDescription,
                  start: finalStartDate,
                  end: finalEndDate,
                  allDay:
                    input.allDay !== undefined
                      ? input.allDay
                      : existingEvent.allDay,
                  timezone: eventTimezone,
                  location: nextLocation,
                  recurrence:
                    input.recurrence !== undefined
                      ? input.recurrence
                      : existingEvent.recurrence,
                  createdAt: updatedEvent.createdAt,
                  updatedAt: updatedEvent.updatedAt,
                })
              : undefined,
          });
        invitationWarnings = await participantResult.sendPendingInvitations();
      }

      const warnings: OperationWarning[] = [...invitationWarnings];

      // Update notifications if event time or reminder changed
      try {
        const timeChanged = startDate || endDate;
        const reminderChanged = input.reminder !== undefined;

        if (timeChanged || reminderChanged) {
          // Get current notification configurations or create from reminder
          let notificationConfigs: {
            notificationType: "email" | "browser";
            minutesBefore: number;
            isEnabled: boolean;
            displayTitle: string | null;
          }[] = [];

          const existingNotifications =
            await this.prisma.eventNotification.findMany({
              where: { eventId: id },
              select: {
                notificationType: true,
                minutesBefore: true,
                isEnabled: true,
                displayTitle: true,
              },
            });
          const preservedDisplayTitle = firstNotificationDisplayTitle(
            input.title,
            nextTitle,
            ...existingNotifications.map((n) => n.displayTitle),
          );

          if (reminderChanged) {
            if (finalReminderValue && finalReminderValue > 0) {
              if (shouldScheduleEventReminder(userSettings)) {
                notificationConfigs.push({
                  notificationType: "email",
                  minutesBefore: finalReminderValue,
                  isEnabled: true,
                  displayTitle: preservedDisplayTitle,
                });
              }
            }
          } else {
            notificationConfigs = existingNotifications.map((n) => ({
              notificationType: n.notificationType as "email" | "browser",
              minutesBefore: n.minutesBefore,
              isEnabled: n.isEnabled,
              displayTitle: firstNotificationDisplayTitle(
                n.displayTitle,
                preservedDisplayTitle,
              ),
            }));
          }

          await this.prisma.eventNotification.deleteMany({
            where: { eventId: id },
          });

          const reminderInserts = [];
          for (const config of notificationConfigs) {
            if (!config.isEnabled) continue;
            reminderInserts.push(
              this.insertUpcomingEventReminder({
                eventId: id,
                eventStart: finalStartDate,
                minutesBefore: config.minutesBefore,
                timezone: eventTimezone,
                displayTitle: config.displayTitle,
                notificationType: config.notificationType,
              }),
            );
          }
          await Promise.all(reminderInserts);

          logger.ok(`Updated notifications for event ${id}`);
        }
      } catch (notificationError) {
        logger.error("Failed to update notifications", errorLogDetails(notificationError));
        warnings.push(reminderScheduleWarning("update"));
      }

      const participantMap = await this.buildParticipantMap([updatedEvent.id]);

      return {
        ...updatedEvent,
        participants: participantMap.get(updatedEvent.id) ?? [],
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    } catch (error: unknown) {
      logger.error("Event update error", errorLogDetails(error));

      // Handle optimistic locking conflict
      if (
        (error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === "P2025") ||
        (error instanceof Error &&
          error.message?.includes("Record to update not found"))
      ) {
        throw new ValidationError(
          "Event was modified by another process. Please refresh and try again.",
        );
      }
      throw error;
    }
  }

  async delete(userId: string, eventId: string): Promise<EventDeleteResult> {
    try {
      const requestedId = eventId;

      let id = requestedId;
      if (
        id.includes("_") &&
        id.match(/_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      ) {
        const parentEventId = id.split("_")[0]!;
        logger.info(
          `Redirecting delete request from instance ${id} to parent ${parentEventId}`,
        );
        id = parentEventId;
      }

      const existingEvent = await this.prisma.calendarEvent.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          participants: true,
        },
      });

      if (!existingEvent) {
        throw new ValidationError("Event not found or access denied");
      }

      // Check if the event is synced - synced events cannot be deleted
      if (existingEvent.isSynced) {
        throw new ValidationError(
          "Cannot delete synced events. Synced events are read-only.",
        );
      }

      const isCancelledAttendeeInvitation =
        this.isAttendeeImportedInvitationForUser(userId, existingEvent) &&
        existingEvent.isCancelled;

      if (this.isAttendeeImportedInvitationForUser(userId, existingEvent)) {
        if (!existingEvent.isCancelled) {
          await this.respondToInvitation({
            userId,
            eventId: id,
            status: "declined",
          });
          await this.purgeInvitationEventRecord(id);
          return {
            success: true,
            message: "Invitation declined and removed from your calendar",
            deletedEventId: id,
          };
        }
      }

      if (
        this.stalwartClient &&
        existingEvent.stalwartAccountId &&
        existingEvent.stalwartEventId
      ) {
        await this.stalwartClient.deleteEvent({
          accountId: existingEvent.stalwartAccountId,
          eventId: existingEvent.stalwartEventId,
        });
      }

      const [deletedNotifications] = await this.prisma.$transaction([
        this.prisma.eventNotification.deleteMany({
          where: { eventId: id },
        }),
        this.prisma.notificationLog.deleteMany({
          where: { eventId: id },
        }),
        this.prisma.calendarEvent.delete({
          where: { id },
        }),
      ]);
      logger.ok(
        `Deleted ${deletedNotifications.count} notifications for event ${id}`,
      );

      return {
        success: true,
        message: isCancelledAttendeeInvitation
          ? "Cancelled event removed from your calendar"
          : "Event deleted successfully",
        deletedEventId: id,
      };
    } catch (error) {
      logger.error("Event deletion error", errorLogDetails(error));
      throw error;
    }
  }

  async bulkAction(input: EventBulkInput): Promise<EventBulkResult> {
    try {
      const { userId, action, eventIds, targetCalendarId } = input;

      if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
        throw new ValidationError("Event IDs array is required", "eventIds");
      }

      const events = await this.prisma.calendarEvent.findMany({
        where: {
          id: { in: eventIds },
          userId,
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
        },
      });

      if (events.length !== eventIds.length) {
        throw new ValidationError(
          "Some events not found or access denied",
          "eventIds",
        );
      }

      const syncedEvents = events.filter((event) => event.isSynced);
      if (syncedEvents.length > 0) {
        throw new ValidationError(
          `Cannot modify synced events. The following synced events are read-only: ${syncedEvents.map((e) => e.title).join(", ")}`,
        );
      }

      const attendeeEvents = events.filter(
        (event) =>
          this.isAttendeeCopyForUser(userId, event.participants) &&
          !event.isCancelled,
      );
      if (attendeeEvents.length > 0 && action !== "delete") {
        throw new ValidationError(
          `Imported invitation events are read-only for attendees: ${attendeeEvents.map((event) => event.title).join(", ")}`,
        );
      }

      let result;

      switch (action) {
        case "move": {
          if (!targetCalendarId) {
            throw new ValidationError(
              "Target calendar ID is required for move operation",
              "targetCalendarId",
            );
          }

          const targetCalendar = await this.prisma.calendar.findFirst({
            where: {
              id: targetCalendarId,
              userId,
            },
          });

          if (!targetCalendar) {
            throw new ValidationError(
              "Target calendar not found or access denied",
              "targetCalendarId",
            );
          }

          if (
            targetCalendar.icsShareEnabled &&
            events.some((event) => event.encryptionState === "encrypted")
          ) {
            throw new ValidationError(
              "Fully encrypted events cannot be moved into a shared calendar until they are reopened and saved.",
              "targetCalendarId",
            );
          }

          const stalwartAccountId = await this.getStalwartAccountId(userId);
          const targetStalwartCalendarId = stalwartAccountId
            ? await this.ensureRemoteCalendar({
                accountId: stalwartAccountId,
                calendar: targetCalendar,
              })
            : null;

          if (
            this.stalwartClient &&
            stalwartAccountId &&
            targetStalwartCalendarId
          ) {
            const moveUpdates = [];
            for (const event of events) {
              if (!event.stalwartEventId) continue;
              moveUpdates.push(
                this.stalwartClient.updateEvent({
                  accountId: event.stalwartAccountId ?? stalwartAccountId,
                  eventId: event.stalwartEventId,
                  patch: {
                    calendarIds: {
                      [targetStalwartCalendarId]: true,
                    },
                  },
                }),
              );
            }
            await Promise.all(moveUpdates);
          }

          result = await this.prisma.calendarEvent.updateMany({
            where: {
              id: { in: eventIds },
              userId,
            },
            data: {
              calendarId: targetCalendarId,
              stalwartCalendarId: targetStalwartCalendarId,
              updatedAt: new Date(),
            },
          });

          return {
            success: true,
            message: `Successfully moved ${result.count} events to ${targetCalendar.name}`,
            eventsProcessed: result.count,
            action: "move",
          };
        }

        case "delete": {
          const attendeeInvitationEvents = events.filter((event) =>
            this.isAttendeeImportedInvitationForUser(userId, event),
          );
          const activeAttendeeInvitationEvents = attendeeInvitationEvents.filter(
            (event) => !event.isCancelled,
          );
          const cancelledAttendeeInvitationEvents =
            attendeeInvitationEvents.filter((event) => event.isCancelled);
          const regularEvents = events.filter(
            (event) =>
              !this.isAttendeeImportedInvitationForUser(userId, event),
          );

          await Promise.all(
            activeAttendeeInvitationEvents.map((event) =>
              this.respondToInvitation({
                userId,
                eventId: event.id,
                status: "declined",
              }),
            ),
          );

          const eventsToDeleteLocally = [
            ...regularEvents,
            ...cancelledAttendeeInvitationEvents,
          ];

          const remoteDeletes = [];
          for (const event of eventsToDeleteLocally) {
            if (
              !this.stalwartClient ||
              !event.stalwartAccountId ||
              !event.stalwartEventId
            ) {
              continue;
            }
            remoteDeletes.push(
              this.stalwartClient.deleteEvent({
                accountId: event.stalwartAccountId,
                eventId: event.stalwartEventId,
              }),
            );
          }
          await Promise.all(remoteDeletes);

          const localDeleteEventIds = eventsToDeleteLocally.map(
            (event) => event.id,
          );
          let deletedCount = activeAttendeeInvitationEvents.length;

          if (localDeleteEventIds.length > 0) {
            const deletedNotifications =
              await this.prisma.eventNotification.deleteMany({
                where: { eventId: { in: localDeleteEventIds } },
              });
            logger.ok(
              `Deleted ${deletedNotifications.count} notifications for ${localDeleteEventIds.length} events`,
            );

            await this.prisma.notificationLog.deleteMany({
              where: { eventId: { in: localDeleteEventIds } },
            });

            const deleteResult = await this.prisma.calendarEvent.deleteMany({
              where: {
                id: { in: localDeleteEventIds },
                userId,
              },
            });
            deletedCount += deleteResult.count;
          }

          return {
            success: true,
            message: `Successfully deleted ${deletedCount} events`,
            eventsProcessed: deletedCount,
            action: "delete",
          };
        }

        case "duplicate": {
          const duplicatedEvents = [];
          for (const event of events) {
            const duplicateTitle =
              event.encryptionState === "encrypted"
                ? event.title
                : `${event.title} (Copy)`;
            const duplicated = await this.prisma.calendarEvent.create({
              data: {
                title: duplicateTitle,
                description: event.description,
                encryptedContent: event.encryptedContent,
                blindIndexTokens: event.blindIndexTokens,
                encryptionState: event.encryptionState,
                encryptionKeyVersion: event.encryptionKeyVersion,
                start: event.start,
                end: event.end,
                allDay: event.allDay,
                location: event.location,
                color: event.color,
                isPrivate: event.isPrivate,
                reminder: event.reminder,
                recurrence: null,
                calendarId: targetCalendarId || event.calendarId,
                categoryId: event.categoryId,
                userId,
              },
              include: {
                category: true,
                calendar: true,
              },
            });

            const attendeeParticipants: Array<{
              email: string;
              displayName: string | undefined;
              role: "attendee";
              status: EventParticipantStatus;
            }> = [];
            for (const participant of event.participants ?? []) {
              if (participant.role === "organizer") continue;
              attendeeParticipants.push({
                email: participant.email,
                displayName:
                  participant.displayName ??
                  participant.user?.name ??
                  undefined,
                role: "attendee",
                status: participant.status as EventParticipantStatus,
              });
            }
            const duplicatedParticipants =
              await this.eventParticipantService.syncParticipants({
                eventId: duplicated.id,
                participants: attendeeParticipants,
                ownerUserId: userId,
                tx: this.prisma,
              });
            await duplicatedParticipants.sendPendingInvitations();

            try {
              if (event.reminder && event.reminder > 0) {
                const userSettings = await this.prisma.userSettings.findUnique({
                  where: { userId },
                });

                if (shouldScheduleEventReminder(userSettings)) {
                  const sourceReminder = await this.prisma.eventNotification.findFirst(
                    {
                      where: {
                        eventId: event.id,
                        displayTitle: { not: null },
                      },
                      select: { displayTitle: true },
                    },
                  );
                  const reminderDisplayTitle = firstNotificationDisplayTitle(
                    sourceReminder?.displayTitle,
                    event.title,
                  );
                  const created = await this.insertUpcomingEventReminder({
                    eventId: duplicated.id,
                    eventStart: duplicated.start,
                    minutesBefore: event.reminder,
                    timezone: duplicated.timezone,
                    displayTitle: reminderDisplayTitle,
                  });
                  if (created) {
                    logger.ok(
                      `Created notification for duplicated event ${duplicated.id}`,
                    );
                  }
                }
              }
            } catch (notificationError) {
              logger.error(
                "Failed to create notifications for duplicated event",
                errorLogDetails(notificationError),
              );
            }

            duplicatedEvents.push({
              ...duplicated,
              participants: duplicatedParticipants.participants,
            });
          }

          return {
            success: true,
            message: `Successfully duplicated ${duplicatedEvents.length} events`,
            eventsProcessed: duplicatedEvents.length,
            action: "duplicate",
            createdEvents: duplicatedEvents,
          };
        }

        default:
          throw new ValidationError(
            "Invalid action. Use 'move', 'delete', or 'duplicate'",
            "action",
          );
      }
    } catch (error) {
      logger.error("Bulk operation error", errorLogDetails(error));
      throw error;
    }
  }

  async exportIcs(
    userId: string,
    eventId: string,
  ): Promise<EventIcsExportResult> {
    const requestedId = eventId;

    let resolvedEventId = requestedId;
    let recurrenceInstanceDate: Date | undefined;

    const recurringInstanceMatch = requestedId.match(
      /^(.+?)_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$/,
    );

    if (recurringInstanceMatch?.[1] && recurringInstanceMatch?.[2]) {
      resolvedEventId = recurringInstanceMatch[1];
      const parsedOccurrenceDate = new Date(recurringInstanceMatch[2]);
      if (!Number.isNaN(parsedOccurrenceDate.getTime())) {
        recurrenceInstanceDate = parsedOccurrenceDate;
      }
    }

    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id: resolvedEventId,
        userId,
      },
      include: {
        calendar: true,
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new ValidationError("Event not found or access denied");
    }

    if (event.encryptionState === "encrypted") {
      throw new ValidationError(
        "Fully encrypted events cannot be exported as ICS.",
      );
    }

    let exportedEvent = toIcsBuildEvent(event);
    if (recurrenceInstanceDate) {
      const durationMs = Math.max(
        event.end.getTime() - event.start.getTime(),
        event.allDay ? MS_PER_DAY : MS_PER_MINUTE,
      );

      exportedEvent = {
        ...exportedEvent,
        uid: `${event.externalId || event.id}-${recurrenceInstanceDate.toISOString()}@solace-calendar.local`,
        start: recurrenceInstanceDate,
        end: new Date(recurrenceInstanceDate.getTime() + durationMs),
        recurrence: undefined,
      };
    }

    const icsContent = buildIcsEventFile({
      calendar: {
        name: event.calendar.name,
        timezone: resolveTimezone(event.timezone),
      },
      event: exportedEvent,
    });

    const fileBaseName = recurrenceInstanceDate
      ? `${event.title}-${recurrenceInstanceDate.toISOString().slice(0, 10)}`
      : event.title;

    return {
      icsContent,
      filename: toSafeIcsFilename(fileBaseName),
    };
  }
}
