import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  EventParticipantInput,
  EventParticipantStatus,
} from "@workspace/calendar-core";
import type {
  IEventService,
  EventSearchInput,
  EventListInput,
  EventCreateInput,
  EventUpdateInput,
  EventBulkInput,
  EventDeleteResult,
  EventBulkResult,
  EventIcsExportResult,
} from "../contracts/event.contract";
import { ValidationError } from "../lib/errors";
import { ensureUserCalendars } from "../lib/user-setup";
import { RecurrenceEngine } from "../lib/recurrence";
import { NotificationCalculator } from "../lib/notification-calculator";
import { ALLOWED_CALENDAR_COLORS, isValidCalendarColor } from "../lib/colors";
import {
  normalizeEventEncryptionMode,
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
  sortEventParticipants,
  EVENT_PARTICIPANT_USER_SELECT,
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
const MAX_REMINDER_MINUTES = 43200; // 30 days

export class EventService implements IEventService {
  private readonly initializedUsers = new Set<string>();

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

    return userSettings?.timezone || "UTC";
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
    const resolved = new Map<string, ResolvedStalwartParticipant>();

    if (owner?.email?.trim()) {
      resolved.set(owner.email.trim().toLowerCase(), {
        email: owner.email.trim().toLowerCase(),
        displayName: owner.name?.trim() || owner.email,
        role: "organizer",
        status: "accepted",
      });
    }

    for (const participant of participants) {
      const email = participant.email?.trim().toLowerCase();
      if (!email) continue;
      resolved.set(email, {
        email,
        displayName: participant.displayName?.trim() || email,
        role: participant.role ?? "attendee",
        status: participant.status ?? "pending",
      });
    }

    return [...resolved.values()];
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
        reminder: mapped.reminder,
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

  private async attachParticipantsToSearchEvents(
    events: Record<string, unknown>[],
    userId: string,
  ) {
    const participantMap = await this.buildParticipantMap(
      events
        .map((event) =>
          typeof event.id === "string" && event.id ? event.id : null,
        )
        .filter((eventId): eventId is string => eventId !== null),
    );

    return events
      .map((event) => ({
        ...event,
        participants:
          typeof event.id === "string"
            ? (participantMap.get(event.id) ?? [])
            : [],
      }))
      .filter(
        (event) =>
          !this.shouldHideDeclinedInvitationEvent(
            userId,
            event.participants as ReturnType<typeof mapEventParticipant>[],
          ),
      );
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
      await this.syncStalwartEvents({
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
        include: {
          category: true,
          calendar: true,
          participants: {
            include: {
              user: {
                select: EVENT_PARTICIPANT_USER_SELECT,
              },
            },
          },
        },
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          userId,
          recurrence: { not: null },
          parentEventId: null,
        },
        include: {
          category: true,
          calendar: true,
          recurrenceExceptions: true,
          participants: {
            include: {
              user: {
                select: EVENT_PARTICIPANT_USER_SELECT,
              },
            },
          },
        },
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
          `Error generating instances for event ${recurringEvent.id}:`,
          error,
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
        include: {
          category: true,
          calendar: true,
          participants: {
            include: {
              user: {
                select: EVENT_PARTICIPANT_USER_SELECT,
              },
            },
          },
        },
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

    const events = [
      ...regularEvents,
      ...recurringInstances,
      ...modifiedInstances,
    ]
      .map((event) => ({
        ...event,
        participants: sortEventParticipants(
          (event.participants ?? []).map((participant) =>
            mapEventParticipant(participant as EventParticipantRecord),
          ),
        ),
      }))
      .filter(
        (event) =>
          !this.shouldHideDeclinedInvitationEvent(userId, event.participants),
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());

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
        participants: sortEventParticipants(
          (event.participants ?? []).map((participant) =>
            mapEventParticipant(participant as EventParticipantRecord),
          ),
        ),
      };
    } catch (error) {
      logger.error("Event fetch error:", error);
      throw error;
    }
  }

  async getInvitationByExternalId(
    userId: string,
    externalId: string,
  ): Promise<unknown | null> {
    const normalizedExternalId = externalId.trim();
    if (!normalizedExternalId) {
      throw new ValidationError("External event id is required", "externalId");
    }

    let event = await this.prisma.calendarEvent.findFirst({
      where: {
        userId,
        externalId: normalizedExternalId,
        subscriptionId: null,
      },
      include: {
        category: true,
        calendar: true,
        participants: {
          include: {
            user: {
              select: EVENT_PARTICIPANT_USER_SELECT,
            },
          },
        },
      },
    });

    const stalwartAccountId = await this.getStalwartAccountId(userId);
    if (stalwartAccountId) {
      await this.syncStalwartEventByUid({
        userId,
        accountId: stalwartAccountId,
        uid: normalizedExternalId,
      });
      event = await this.prisma.calendarEvent.findFirst({
        where: {
          userId,
          externalId: normalizedExternalId,
          subscriptionId: null,
        },
        include: {
          category: true,
          calendar: true,
          participants: {
            include: {
              user: {
                select: EVENT_PARTICIPANT_USER_SELECT,
              },
            },
          },
        },
      });
    }

    if (!event) {
      return null;
    }

    return {
      ...event,
      participants: sortEventParticipants(
        (event.participants ?? []).map((participant) =>
          mapEventParticipant(participant as EventParticipantRecord),
        ),
      ),
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
      include: {
        category: true,
        calendar: true,
        participants: {
          include: {
            user: {
              select: EVENT_PARTICIPANT_USER_SELECT,
            },
          },
        },
      },
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

    const nextParticipants = event.participants.map((participant) => ({
      email: participant.email,
      displayName: participant.displayName ?? undefined,
      role: participant.role as "organizer" | "attendee",
      status:
        participant.id === attendee.id
          ? input.status
          : (participant.status as EventParticipantStatus),
    }));

    if (
      this.stalwartClient &&
      event.stalwartAccountId &&
      event.stalwartCalendarId &&
      event.stalwartEventId
    ) {
      await this.stalwartClient.updateEvent({
        accountId: event.stalwartAccountId,
        eventId: event.stalwartEventId,
        patch: buildStalwartEventPayload({
          calendarId: event.stalwartCalendarId,
          uid:
            event.stalwartUid ||
            event.externalId ||
            `${event.id}@solace-calendar.local`,
          title: event.title,
          description: event.description,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          timezone: event.timezone || "UTC",
          location: event.location,
          recurrence: event.recurrence,
          reminder: event.reminder,
          participants: nextParticipants,
        }),
        sendSchedulingMessages: true,
      });

      if (input.status === "declined") {
        // Remove the event from the Stalwart calendar after sending the DECLINED iTIP reply
        await this.stalwartClient.deleteEvent({
          accountId: event.stalwartAccountId,
          eventId: event.stalwartEventId,
        });
      } else {
        await this.syncStalwartEventsByIds({
          userId: input.userId,
          accountId: event.stalwartAccountId,
          eventIds: [event.stalwartEventId],
        });
      }
    } else {
      await this.prisma.eventParticipant.update({
        where: { id: attendee.id },
        data: { status: input.status },
      });
    }

    // When declining, delete the event from the local DB and return a deleted marker
    if (input.status === "declined") {
      await this.prisma.eventNotification.deleteMany({
        where: { eventId: input.eventId },
      });
      await this.prisma.notificationLog.deleteMany({
        where: { eventId: input.eventId },
      });
      await this.prisma.calendarEvent.delete({
        where: { id: input.eventId },
      });
      return { deleted: true as const };
    }

    const updatedEvent = await this.prisma.calendarEvent.findFirst({
      where: {
        id: input.eventId,
        userId: input.userId,
      },
      include: {
        category: true,
        calendar: true,
        participants: {
          include: {
            user: {
              select: EVENT_PARTICIPANT_USER_SELECT,
            },
          },
        },
      },
    });

    if (!updatedEvent) {
      throw new ValidationError("Event not found or access denied");
    }

    return {
      ...updatedEvent,
      participants: sortEventParticipants(
        (updatedEvent.participants ?? []).map((participant) =>
          mapEventParticipant(participant as EventParticipantRecord),
        ),
      ),
    };
  }

  async create(input: EventCreateInput): Promise<unknown> {
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
          logger.error("Recurrence validation error:", recurrenceError);
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

      if (title.trim().length > 255) {
        throw new ValidationError(
          "Title cannot exceed 255 characters",
          "title",
        );
      }

      if (description && description.length > 1000) {
        throw new ValidationError(
          "Description cannot exceed 1000 characters",
          "description",
        );
      }

      if (location && location.length > 255) {
        throw new ValidationError(
          "Location cannot exceed 255 characters",
          "location",
        );
      }

      if (!calendarId) {
        throw new ValidationError("Calendar ID is required", "calendarId");
      }

      const calendar = await this.prisma.calendar.findFirst({
        where: {
          id: calendarId,
          userId,
        },
      });

      if (!calendar) {
        throw new ValidationError(
          "Invalid calendar or calendar does not belong to user",
          "calendarId",
        );
      }

      if (calendar.kind !== "owned" || calendar.isSyncOnly) {
        throw new ValidationError(
          "Cannot create events in a read-only calendar. This calendar is managed by a subscription or public feed.",
          "calendarId",
        );
      }

      if (reminder !== undefined && reminder !== null) {
        const reminderValue = Number(reminder);
        if (
          isNaN(reminderValue) ||
          reminderValue < 0 ||
          reminderValue > MAX_REMINDER_MINUTES
        ) {
          throw new ValidationError(
            `Reminder must be a number between 0 and ${MAX_REMINDER_MINUTES} minutes`,
            "reminder",
          );
        }
        reminder = reminderValue;
      }

      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: {
          timezone: true,
          emailNotifications: true,
          eventEncryptionMode: true,
        },
      });
      const eventTimezone = timezone?.trim() || userSettings?.timezone || "UTC";

      const hasEncryptedPayload = this.hasEncryptedPayload(encryptedContent);
      const encryptionMode = normalizeEventEncryptionMode(
        userSettings?.eventEncryptionMode,
      );
      const calendarForceFullEncryption = calendar.forceFullEncryption === true;
      const requiresFullEncryption =
        encryptionMode === "full" || calendarForceFullEncryption;

      if (requiresFullEncryption && !hasEncryptedPayload) {
        throw new ValidationError(
          "Full event encryption requires an active encryption session.",
          "encryptedContent",
        );
      }

      const persistencePolicy = resolveEventPersistencePolicy({
        mode: encryptionMode,
        hasEncryptedPayload,
        title,
        description,
        location,
        reminderMinutes: reminder ?? null,
        calendarShareEnabled: calendar.icsShareEnabled,
        calendarForceFullEncryption,
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
          await this.stalwartClient.deleteEvent({
            accountId: stalwartAccountId,
            eventId: stalwartEventId,
            sendSchedulingMessages: false,
          });
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
      await participantResult.sendPendingInvitations();

      try {
        if (reminder && reminder > 0) {
          if (userSettings?.emailNotifications !== false) {
            const notificationSchedule =
              NotificationCalculator.buildNotificationSchedule(
                startDate,
                reminder,
                eventTimezone,
              );

            if (notificationSchedule.notificationTime > new Date()) {
              await this.prisma.$executeRaw`
                INSERT INTO public.event_notification (
                  id,
                  event_id,
                  notification_type,
                  minutes_before,
                  notification_time,
                  notification_date_local,
                  notification_timezone,
                  is_enabled,
                  is_sent,
                  created_at,
                  updated_at
                ) VALUES (
                  ${crypto.randomUUID()},
                  ${event.id},
                  ${"email"},
                  ${reminder},
                  ${notificationSchedule.notificationTime},
                  ${notificationSchedule.notificationDateLocal},
                  ${notificationSchedule.notificationTimezone},
                  true,
                  false,
                  NOW(),
                  NOW()
                )
              `;
            } else {
              logger.info(
                `Skipping creating past notification for event ${event.id}`,
              );
            }

            logger.ok(`Created notification for event ${event.id}`);
          }
        }
      } catch (notificationError) {
        logger.error("Failed to create notifications:", notificationError);
      }

      return {
        ...event,
        participants: participantResult.participants,
      };
    } catch (error) {
      logger.error("Event creation error:", error);
      throw error;
    }
  }

  async update(input: EventUpdateInput): Promise<unknown> {
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

      if (this.isAttendeeCopyForUser(userId, existingEvent.participants)) {
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

      if (input.title !== undefined) {
        if (!input.title?.trim()) {
          throw new ValidationError(
            "Title is required and cannot be empty",
            "title",
          );
        }
        if (input.title.trim().length > 255) {
          throw new ValidationError(
            "Title cannot exceed 255 characters",
            "title",
          );
        }
      }

      if (
        input.description !== undefined &&
        input.description &&
        input.description.length > 1000
      ) {
        throw new ValidationError(
          "Description cannot exceed 1000 characters",
          "description",
        );
      }

      if (
        input.location !== undefined &&
        input.location &&
        input.location.length > 255
      ) {
        throw new ValidationError(
          "Location cannot exceed 255 characters",
          "location",
        );
      }

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
        targetCalendar = await this.prisma.calendar.findFirst({
          where: {
            id: input.calendarId,
            userId,
          },
        });

        if (!targetCalendar) {
          throw new ValidationError(
            "Invalid calendar or calendar does not belong to user",
            "calendarId",
          );
        }

        if (targetCalendar.kind !== "owned" || targetCalendar.isSyncOnly) {
          throw new ValidationError(
            "Cannot move events to a read-only calendar.",
            "calendarId",
          );
        }
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

      let reminderValue: number | null | undefined = input.reminder;
      if (input.reminder !== undefined && input.reminder !== null) {
        reminderValue = Number(input.reminder);
        if (
          isNaN(reminderValue) ||
          reminderValue < 0 ||
          reminderValue > MAX_REMINDER_MINUTES
        ) {
          throw new ValidationError(
            `Reminder must be a number between 0 and ${MAX_REMINDER_MINUTES} minutes`,
            "reminder",
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
          eventEncryptionMode: true,
        },
      });
      const eventTimezone =
        input.timezone !== undefined
          ? input.timezone?.trim() || userSettings?.timezone || "UTC"
          : existingEvent.timezone;

      const encryptionMode = normalizeEventEncryptionMode(
        userSettings?.eventEncryptionMode,
      );
      const calendarForceFullEncryption =
        finalCalendar.forceFullEncryption === true;
      const requiresFullEncryption =
        encryptionMode === "full" || calendarForceFullEncryption;
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

      if (
        sensitiveFieldsProvided &&
        input.encryptedContent === undefined &&
        (existingHasEncryptedPayload || requiresFullEncryption)
      ) {
        throw new ValidationError(
          "Encrypted content payload is required when updating protected event fields.",
          "encryptedContent",
        );
      }

      if (requiresFullEncryption && !hasEncryptedPayload) {
        throw new ValidationError(
          "Full event encryption requires an active encryption session.",
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
        mode: encryptionMode,
        hasEncryptedPayload,
        title: nextTitle,
        description: nextDescription,
        location: nextLocation,
        reminderMinutes: finalReminderValue,
        calendarShareEnabled: finalCalendar.icsShareEnabled,
        calendarForceFullEncryption,
      });

      if (
        persistencePolicy.encryptionState !== "encrypted" &&
        existingEvent.encryptionState === "encrypted" &&
        !sensitiveFieldsProvided
      ) {
        throw new ValidationError(
          "This event is fully encrypted. Reopen and save it before enabling reminders or sharing.",
          "encryptedContent",
        );
      }

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
            logger.error("Recurrence validation error:", recurrenceError);
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
            patch: remotePayload,
          });
        } else {
          const remoteEvent = await this.stalwartClient.createEvent({
            accountId: stalwartAccountId,
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
        await participantResult.sendPendingInvitations();
      }

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
          }[] = [];

          if (reminderChanged) {
            if (finalReminderValue && finalReminderValue > 0) {
              if (userSettings?.emailNotifications !== false) {
                notificationConfigs.push({
                  notificationType: "email",
                  minutesBefore: finalReminderValue,
                  isEnabled: true,
                });
              }
            }
          } else {
            const existingNotifications =
              await this.prisma.eventNotification.findMany({
                where: { eventId: id },
              });

            notificationConfigs = existingNotifications.map((n) => ({
              notificationType: n.notificationType as "email" | "browser",
              minutesBefore: n.minutesBefore,
              isEnabled: n.isEnabled,
            }));
          }

          await this.prisma.eventNotification.deleteMany({
            where: { eventId: id },
          });

          if (notificationConfigs.length > 0) {
            const now = new Date();
            for (const config of notificationConfigs) {
              const notificationSchedule =
                NotificationCalculator.buildNotificationSchedule(
                  finalStartDate,
                  config.minutesBefore,
                  eventTimezone,
                );
              if (notificationSchedule.notificationTime <= now) continue;
              await this.prisma.$executeRaw`
                INSERT INTO public.event_notification (
                  id,
                  event_id,
                  notification_type,
                  minutes_before,
                  notification_time,
                  notification_date_local,
                  notification_timezone,
                  is_enabled,
                  is_sent,
                  created_at,
                  updated_at
                ) VALUES (
                  ${crypto.randomUUID()},
                  ${id},
                  ${config.notificationType},
                  ${config.minutesBefore},
                  ${notificationSchedule.notificationTime},
                  ${notificationSchedule.notificationDateLocal},
                  ${notificationSchedule.notificationTimezone},
                  ${config.isEnabled},
                  false,
                  NOW(),
                  NOW()
                )
              `;
            }
          }

          logger.ok(`Updated notifications for event ${id}`);
        }
      } catch (notificationError) {
        logger.error("Failed to update notifications:", notificationError);
        // Notification failure shouldn't fail the event update
      }

      const participantMap = await this.buildParticipantMap([updatedEvent.id]);

      return {
        ...updatedEvent,
        participants: participantMap.get(updatedEvent.id) ?? [],
      };
    } catch (error: unknown) {
      logger.error("Event update error:", error);

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

      if (this.isAttendeeCopyForUser(userId, existingEvent.participants)) {
        throw new ValidationError(
          "Imported invitation events are read-only for attendees.",
        );
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

      const deletedNotifications =
        await this.prisma.eventNotification.deleteMany({
          where: { eventId: id },
        });
      logger.ok(
        `Deleted ${deletedNotifications.count} notifications for event ${id}`,
      );

      await this.prisma.notificationLog.deleteMany({
        where: { eventId: id },
      });

      await this.prisma.calendarEvent.delete({
        where: { id },
      });

      return {
        success: true,
        message: "Event deleted successfully",
        deletedEventId: id,
      };
    } catch (error) {
      logger.error("Event deletion error:", error);
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

      const attendeeEvents = events.filter((event) =>
        this.isAttendeeCopyForUser(userId, event.participants),
      );
      if (attendeeEvents.length > 0) {
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
            for (const event of events) {
              if (!event.stalwartEventId) continue;
              await this.stalwartClient.updateEvent({
                accountId: event.stalwartAccountId ?? stalwartAccountId,
                eventId: event.stalwartEventId,
                patch: {
                  calendarIds: {
                    [targetStalwartCalendarId]: true,
                  },
                },
              });
            }
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
          for (const event of events) {
            if (
              this.stalwartClient &&
              event.stalwartAccountId &&
              event.stalwartEventId
            ) {
              await this.stalwartClient.deleteEvent({
                accountId: event.stalwartAccountId,
                eventId: event.stalwartEventId,
              });
            }
          }

          const deletedNotifications =
            await this.prisma.eventNotification.deleteMany({
              where: { eventId: { in: eventIds } },
            });
          logger.ok(
            `Deleted ${deletedNotifications.count} notifications for ${eventIds.length} events`,
          );

          await this.prisma.notificationLog.deleteMany({
            where: { eventId: { in: eventIds } },
          });

          result = await this.prisma.calendarEvent.deleteMany({
            where: {
              id: { in: eventIds },
              userId,
            },
          });

          return {
            success: true,
            message: `Successfully deleted ${result.count} events`,
            eventsProcessed: result.count,
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

            const duplicatedParticipants =
              await this.eventParticipantService.syncParticipants({
                eventId: duplicated.id,
                participants: (event.participants ?? [])
                  .filter((participant) => participant.role !== "organizer")
                  .map((participant) => ({
                    email: participant.email,
                    displayName:
                      participant.displayName ??
                      participant.user?.name ??
                      undefined,
                    role: "attendee" as const,
                    status: participant.status as EventParticipantStatus,
                  })),
                ownerUserId: userId,
                tx: this.prisma,
              });
            await duplicatedParticipants.sendPendingInvitations();

            try {
              if (event.reminder && event.reminder > 0) {
                const userSettings = await this.prisma.userSettings.findUnique({
                  where: { userId },
                });

                if (userSettings?.emailNotifications !== false) {
                  const notificationSchedule =
                    NotificationCalculator.buildNotificationSchedule(
                      duplicated.start,
                      event.reminder,
                      duplicated.timezone,
                    );

                  await this.prisma.$executeRaw`
                    INSERT INTO public.event_notification (
                      id,
                      event_id,
                      notification_type,
                      minutes_before,
                      notification_time,
                      notification_date_local,
                      notification_timezone,
                      is_enabled,
                      is_sent,
                      created_at,
                      updated_at
                    ) VALUES (
                      ${crypto.randomUUID()},
                      ${duplicated.id},
                      ${"email"},
                      ${event.reminder},
                      ${notificationSchedule.notificationTime},
                      ${notificationSchedule.notificationDateLocal},
                      ${notificationSchedule.notificationTimezone},
                      true,
                      false,
                      NOW(),
                      NOW()
                    )
                  `;

                  logger.ok(
                    `Created notification for duplicated event ${duplicated.id}`,
                  );
                }
              }
            } catch (notificationError) {
              logger.error(
                "Failed to create notifications for duplicated event:",
                notificationError,
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
      logger.error("Bulk operation error:", error);
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
        event.allDay ? 24 * 60 * 60 * 1000 : 60 * 1000,
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
        timezone: event.timezone || "UTC",
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
