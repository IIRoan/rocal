import { isIP } from "node:net";
import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  ISubscriptionService,
  SubscriptionCreateInput,
  SubscriptionUpdateInput,
  SubscriptionDeleteInput,
  SubscriptionSyncInput,
  ImportIcsInput,
  SyncableSubscription,
  CalendarSubscriptionSyncResponse,
} from "../contracts/subscription.contract";
import {
  type ImportIcsResponse,
  findNationalHolidayCalendarByUrl,
} from "@workspace/calendar-ics";
import { resolveTimezone } from "@workspace/calendar-core";
import {
  areParsedEventParticipantsDifferent,
  parseICSFile,
  convertParsedEventToCalendarEvent,
  isEventModified,
} from "../lib/ics-parser";
import { ALLOWED_CALENDAR_COLORS, isValidCalendarColor } from "../lib/colors";
import { ValidationError, NotFoundError , errorMessage} from "../lib/errors";
import { createLogger } from "@workspace/logger";
import { EventParticipantService } from "./event-participant.service";

const logger = createLogger("backend:subscription-service");
const CALENDAR_FETCH_TIMEOUT_MS = 10_000;
const MAX_CALENDAR_REDIRECTS = 5;
const CALENDAR_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  Accept: "text/calendar,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

export class SubscriptionService implements ISubscriptionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventParticipantService: EventParticipantService = new EventParticipantService(
      prisma,
    ),
  ) {}

  private async getUserTimezone(userId: string): Promise<string> {
    let userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!userSettings) {
      userSettings = await this.prisma.userSettings.create({
        data: { userId },
      });
    }

    return resolveTimezone(userSettings.timezone);
  }

  private validateExternalCalendarUrl(url: string): URL {
    const parsedUrl = new URL(url);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new ValidationError(
        "Only HTTP and HTTPS URLs are supported",
        "url",
      );
    }

    const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (this.isPrivateHostname(hostname)) {
      throw new ValidationError(
        "URLs pointing to internal or private networks are not allowed",
        "url",
      );
    }

    return parsedUrl;
  }

  private isPrivateHostname(hostname: string): boolean {
    if (
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "::" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    ) {
      return true;
    }

    if (hostname.startsWith("::ffff:")) {
      return this.isPrivateHostname(hostname.slice("::ffff:".length));
    }

    const ipVersion = isIP(hostname);

    if (ipVersion === 4) {
      const [firstOctet = 0, secondOctet = 0] = hostname
        .split(".")
        .map((octet) => Number.parseInt(octet, 10));

      return (
        firstOctet === 0 ||
        firstOctet === 10 ||
        firstOctet === 127 ||
        (firstOctet === 169 && secondOctet === 254) ||
        (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
        (firstOctet === 192 && secondOctet === 168)
      );
    }

    if (ipVersion === 6) {
      return (
        hostname === "::1" ||
        hostname === "::" ||
        hostname.startsWith("fc") ||
        hostname.startsWith("fd") ||
        /^fe[89ab]/.test(hostname)
      );
    }

    return false;
  }

  private async fetchCalendarResponse(
    url: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    let currentUrl = this.validateExternalCalendarUrl(url).toString();

    for (
      let redirectCount = 0;
      redirectCount <= MAX_CALENDAR_REDIRECTS;
      redirectCount++
    ) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        CALENDAR_FETCH_TIMEOUT_MS,
      );

      try {
        const response = await fetch(currentUrl, {
          headers: {
            ...CALENDAR_FETCH_HEADERS,
            ...extraHeaders,
          },
          redirect: "manual",
          signal: controller.signal,
        });

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirectCount === MAX_CALENDAR_REDIRECTS) {
            throw new ValidationError(
              "Too many redirects while fetching calendar URL",
              "url",
            );
          }

          const location = response.headers.get("location");

          if (!location) {
            throw new ValidationError(
              "Calendar server returned a redirect without a location",
              "url",
            );
          }

          currentUrl = this.validateExternalCalendarUrl(
            new URL(location, currentUrl).toString(),
          ).toString();
          continue;
        }

        return response;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ValidationError(
            `Calendar request timed out after ${CALENDAR_FETCH_TIMEOUT_MS / 1000} seconds`,
            "url",
          );
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw new ValidationError(
      "Too many redirects while fetching calendar URL",
      "url",
    );
  }

  async list(userId: string) {
    return this.prisma.calendarSubscription.findMany({
      where: { userId },
      include: {
        calendar: true,
        _count: { select: { syncLogs: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(input: SubscriptionCreateInput) {
    const { userId, name, url, color } = input;

    if (!name?.trim()) {
      throw new ValidationError("Calendar name is required", "name");
    }

    const existingSubscription =
      await this.prisma.calendarSubscription.findFirst({
        where: { userId, url },
      });

    if (existingSubscription) {
      throw new ValidationError(
        "You are already subscribed to this calendar URL",
        "url",
      );
    }

    // Test the URL
    let testParseResult;
    try {
      const response = await this.fetchCalendarResponse(url);

      if (!response.ok) {
        if (response.status >= 500) {
          throw new ValidationError(
            `The calendar server is currently unavailable (${response.status}). Please try again later or contact the calendar provider.`,
            "url",
          );
        } else if (response.status === 404) {
          throw new NotFoundError(
            `Calendar not found at the provided URL. Please check the URL and try again.`,
          );
        } else if (response.status === 403 || response.status === 401) {
          throw new ValidationError(
            `Access denied to the calendar. The calendar may be private or require authentication.`,
            "url",
          );
        } else {
          throw new ValidationError(
            `Failed to fetch calendar: ${response.status} ${response.statusText}`,
            "url",
          );
        }
      }

      const icsContent = await response.text();
      const userTimezone = await this.getUserTimezone(userId);
      testParseResult = parseICSFile(icsContent, userTimezone);

      if (testParseResult.errors.length > 0) {
        logger.warn("ICS parsing warnings", {
          warningCount: testParseResult.errors.length,
        });
      }
    } catch (error) {
      throw new ValidationError(
        `Unable to fetch or parse calendar from URL: ${errorMessage(error)}`,
        "url",
      );
    }

    const matchingNationalHolidayCalendar =
      findNationalHolidayCalendarByUrl(url);

    const calendarColor =
      color || matchingNationalHolidayCalendar?.defaultColor || "#6366f1";

    if (color && !isValidCalendarColor(color)) {
      throw new ValidationError(
        "Invalid calendar color. Please use a valid hex color or one of the allowed named colors.",
        "color",
      );
    }

    const calendar = await this.prisma.calendar.create({
      data: {
        name: name.trim(),
        color: calendarColor,
        kind: matchingNationalHolidayCalendar ? "public_holiday" : "subscribed",
        isPublic: !!matchingNationalHolidayCalendar,
        isSyncOnly: true,
        isDefault: false,
        userId,
      },
    });

    const subscription = await this.prisma.calendarSubscription.create({
      data: {
        name: name.trim(),
        url,
        userId,
        calendarId: calendar.id,
        lastSyncStatus: "pending",
        syncIntervalMinutes: matchingNationalHolidayCalendar ? 10080 : 15,
      },
      include: { calendar: true },
    });

    // Sync immediately on creation (non-blocking)
    this.syncCalendarSubscription(subscription).catch((err) => {
      logger.error(
        "Initial sync failed for subscription:",
        subscription.id,
        err,
      );
    });

    return subscription;
  }

  async update(input: SubscriptionUpdateInput) {
    const {
      userId,
      subscriptionId,
      name,
      color,
      isActive,
      syncIntervalMinutes,
    } = input;

    const subscription = await this.prisma.calendarSubscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { calendar: true },
    });

    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }

    const trimmedName = name?.trim();

    if (trimmedName !== undefined) {
      if (!trimmedName)
        throw new ValidationError("Calendar name is required", "name");
      if (trimmedName.length > 100)
        throw new ValidationError(
          "Calendar name cannot exceed 100 characters",
          "name",
        );
    }

    if (color !== undefined && !isValidCalendarColor(color)) {
      throw new ValidationError(
        `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g. #FF0000)`,
        "color",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (trimmedName !== undefined || color !== undefined) {
        await tx.calendar.update({
          where: { id: subscription.calendarId },
          data: {
            ...(trimmedName !== undefined ? { name: trimmedName } : {}),
            ...(color !== undefined ? { color } : {}),
          },
        });
      }

      return tx.calendarSubscription.update({
        where: { id: subscriptionId },
        data: {
          ...(trimmedName !== undefined ? { name: trimmedName } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(syncIntervalMinutes !== undefined ? { syncIntervalMinutes } : {}),
        },
        include: { calendar: true },
      });
    });
  }

  async delete(input: SubscriptionDeleteInput) {
    const { userId, subscriptionId, deleteEvents } = input;

    const subscription = await this.prisma.calendarSubscription.findFirst({
      where: { id: subscriptionId, userId },
    });

    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }

    if (deleteEvents) {
      await this.prisma.calendarEvent.deleteMany({
        where: { subscriptionId },
      });

      await this.prisma.calendarSubscription.delete({
        where: { id: subscriptionId },
      });

      await this.prisma.calendar.deleteMany({
        where: { id: subscription.calendarId, userId, isSyncOnly: true },
      });
    } else {
      await this.prisma.calendarEvent.updateMany({
        where: { subscriptionId },
        data: {
          subscriptionId: null,
          isSynced: false,
          externalId: null,
          syncedAt: null,
        },
      });

      await this.prisma.calendar.updateMany({
        where: { id: subscription.calendarId, userId, isSyncOnly: true },
        data: {
          isSyncOnly: false,
          kind: "owned",
        },
      });

      await this.prisma.calendarSubscription.delete({
        where: { id: subscriptionId },
      });
    }

    return { success: true };
  }

  async sync(
    input: SubscriptionSyncInput,
  ): Promise<CalendarSubscriptionSyncResponse> {
    const { userId, subscriptionId } = input;

    const subscription = await this.prisma.calendarSubscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { calendar: true },
    });

    if (!subscription) {
      throw new NotFoundError("Subscription not found");
    }

    return this.syncCalendarSubscription(subscription);
  }

  async importIcs(input: ImportIcsInput): Promise<ImportIcsResponse> {
    const { userId, calendarId, icsContent, fileName } = input;

    const calendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, userId },
    });

    if (!calendar) {
      throw new NotFoundError("Calendar not found or not owned by user");
    }

    const userTimezone = await this.getUserTimezone(userId);
    const parseResult = parseICSFile(icsContent, userTimezone);

    if (parseResult.events.length === 0) {
      throw new ValidationError("No valid events found in ICS file");
    }

    const createdEvents = [];
    const errors = [...parseResult.errors];
    const existingEventsByUid = new Map(
      (
        await this.prisma.calendarEvent.findMany({
          where: {
            calendarId,
            externalId: { in: parseResult.events.map((event) => event.uid) },
            isSynced: false,
          },
        })
      ).map((event) => [event.externalId!, event]),
    );

    for (const parsedEvent of parseResult.events) {
      try {
        const existingEvent = existingEventsByUid.get(parsedEvent.uid);

        if (existingEvent) {
          errors.push(
            `Event "${parsedEvent.title}" with UID ${parsedEvent.uid} already exists in calendar`,
          );
          continue;
        }

        const eventData = convertParsedEventToCalendarEvent(
          parsedEvent,
          userId,
          calendarId,
        );

        const createdEvent = await this.prisma.calendarEvent.create({
          data: eventData,
        });
        const createdParticipants =
          await this.eventParticipantService.syncParticipants({
            eventId: createdEvent.id,
            participants: parsedEvent.participants ?? [],
            tx: this.prisma,
          });
        await createdParticipants.sendPendingInvitations();
        createdEvents.push(createdEvent);
      } catch (error) {
        errors.push(
          `Failed to create event "${parsedEvent.title}": ${errorMessage(error)}`,
        );
      }
    }

    return {
      success: true,
      eventsCreated: createdEvents.length,
      eventsTotal: parseResult.events.length,
      fileName: fileName || "unknown.ics",
      calendarName: parseResult.calendarName,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async syncCalendarSubscription(
    subscription: SyncableSubscription,
  ): Promise<CalendarSubscriptionSyncResponse> {
    const syncLog = await this.prisma.calendarSyncLog.create({
      data: { subscriptionId: subscription.id, status: "started" },
    });

    const startTime = Date.now();

    try {
      const response = await this.fetchCalendarResponse(subscription.url, {
        ...(subscription.etag && { "If-None-Match": subscription.etag }),
        ...(subscription.lastModified && {
          "If-Modified-Since": subscription.lastModified,
        }),
      });

      if (response.status === 304) {
        await this.prisma.calendarSyncLog.update({
          where: { id: syncLog.id },
          data: {
            status: "success",
            completedAt: new Date(),
            syncDurationMs: Date.now() - startTime,
            httpStatusCode: 304,
          },
        });

        await this.prisma.calendarSubscription.update({
          where: { id: subscription.id },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: "success",
            lastErrorMessage: null,
          },
        });

        return {
          status: "success",
          message: "Calendar not modified, no sync needed",
        };
      }

      if (!response.ok) {
        throw new ValidationError(
          `HTTP ${response.status}: ${response.statusText}`,
          "url",
        );
      }

      const icsContent = await response.text();
      const userTimezone = await this.getUserTimezone(subscription.userId);
      const parseResult = parseICSFile(icsContent, userTimezone);

      let eventsAdded = 0;
      let eventsUpdated = 0;
      let eventsDeleted = 0;

      const currentEvents = await this.prisma.calendarEvent.findMany({
        where: { subscriptionId: subscription.id, isSynced: true },
        include: {
          participants: true,
        },
      });

      const currentEventsByUid = new Map(
        currentEvents.map((event) => [event.externalId!, event]),
      );

      const newEventUids = new Set(
        parseResult.events.map((event) => event.uid),
      );

      for (const parsedEvent of parseResult.events) {
        const existingEvent = currentEventsByUid.get(parsedEvent.uid);

        if (!existingEvent) {
          const eventData = convertParsedEventToCalendarEvent(
            parsedEvent,
            subscription.userId,
            subscription.calendarId,
            subscription.id,
          );
          const createdEvent = await this.prisma.calendarEvent.create({
            data: eventData,
          });
          const createdParticipants =
            await this.eventParticipantService.syncParticipants({
              eventId: createdEvent.id,
              participants: parsedEvent.participants ?? [],
              tx: this.prisma,
            });
          await createdParticipants.sendPendingInvitations();
          eventsAdded++;
        } else {
          const eventChanged = isEventModified(existingEvent, parsedEvent);
          const participantsChanged = areParsedEventParticipantsDifferent(
            (existingEvent.participants ?? []).map((participant) => ({
              email: participant.email,
              displayName: participant.displayName,
              role: participant.role,
              status: participant.status,
            })),
            parsedEvent.participants,
          );

          if (eventChanged) {
            await this.prisma.calendarEvent.update({
              where: { id: existingEvent.id },
              data: {
                title: parsedEvent.title,
                description: parsedEvent.description,
                start: parsedEvent.start,
                end: parsedEvent.end,
                allDay: parsedEvent.allDay,
                location: parsedEvent.location,
                recurrence: parsedEvent.recurrence
                  ? JSON.stringify(parsedEvent.recurrence)
                  : null,
                timezone: resolveTimezone(parsedEvent.timezone),
                syncedAt: new Date(),
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
            await updatedParticipants.sendPendingInvitations();
          }

          if (eventChanged || participantsChanged) {
            eventsUpdated++;
          }
        }
      }

      for (const [uid, event] of currentEventsByUid) {
        if (!newEventUids.has(uid)) {
          await this.prisma.calendarEvent.delete({ where: { id: event.id } });
          eventsDeleted++;
        }
      }

      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");

      await this.prisma.calendarSubscription.update({
        where: { id: subscription.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "success",
          lastErrorMessage: null,
          etag,
          lastModified,
        },
      });

      await this.prisma.calendarSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "success",
          eventsAdded,
          eventsUpdated,
          eventsDeleted,
          completedAt: new Date(),
          syncDurationMs: Date.now() - startTime,
          httpStatusCode: response.status,
        },
      });

      return {
        status: "success",
        eventsAdded,
        eventsUpdated,
        eventsDeleted,
        errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
      };
    } catch (error) {
      const message = errorMessage(error);

      await this.prisma.calendarSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "error",
          errorMessage: message,
          completedAt: new Date(),
          syncDurationMs: Date.now() - startTime,
        },
      });

      await this.prisma.calendarSubscription.update({
        where: { id: subscription.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "error",
          lastErrorMessage: message,
        },
      });

      throw error;
    }
  }
}
