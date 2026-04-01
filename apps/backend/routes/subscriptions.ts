import Elysia, { t } from "elysia";
import { prisma } from "../lib/prisma";
import {
  parseICSFile,
  convertParsedEventToCalendarEvent,
  isEventModified,
} from "../lib/ics-parser";
import { Prisma } from "../generated/prisma/index.js";
import type {
  CalendarSubscriptionSyncResponse,
  CreateCalendarSubscriptionRequest,
  ImportIcsRequest,
  ImportIcsResponse,
  UpdateCalendarSubscriptionRequest,
} from "@workspace/calendar-ics";
import { requireAuth } from "../lib/auth-guard";
import { auth } from "../lib/auth";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:subscriptions");

type SyncableSubscription = Prisma.CalendarSubscriptionGetPayload<{
  include: {
    calendar: true;
  };
}>;

export const subscriptionsRoute = new Elysia()
  .use(requireAuth)
  .get(
    "/subscriptions",
    async ({ user, request }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);
      const subscriptions = await prisma.calendarSubscription.findMany({
        where: {
          userId: user.id,
        },
        include: {
          calendar: true,
          _count: {
            select: {
              syncLogs: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return subscriptions;
    },
    {
      detail: {
        tags: ["Calendar Subscriptions"],
        summary: "Get all calendar subscriptions for user",
      },
    },
  )

  .post(
    "/subscriptions",
    async ({ body, user, request }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);
      const { name, url, color } = body;

      if (!name?.trim()) {
        throw new Error("Calendar name is required");
      }

      // Check if URL is already subscribed by this user
      const existingSubscription = await prisma.calendarSubscription.findFirst({
        where: {
          userId: user.id,
          url: url,
        },
      });

      if (existingSubscription) {
        throw new Error("You are already subscribed to this calendar URL");
      }

      // Test the URL by attempting to fetch and parse it
      let testParseResult;
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept: "text/calendar,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) {
          logger.error(
            `❌ HTTP error fetching calendar: ${response.status} ${response.statusText}`,
          );
          if (response.status >= 500) {
            throw new Error(
              `The calendar server is currently unavailable (${response.status}). Please try again later or contact the calendar provider.`,
            );
          } else if (response.status === 404) {
            throw new Error(
              `Calendar not found at the provided URL. Please check the URL and try again.`,
            );
          } else if (response.status === 403 || response.status === 401) {
            throw new Error(
              `Access denied to the calendar. The calendar may be private or require authentication.`,
            );
          } else {
            throw new Error(
              `Failed to fetch calendar: ${response.status} ${response.statusText}`,
            );
          }
        }

        const icsContent = await response.text();
        logger.info("📄 Fetched ICS content length:", icsContent.length);
        logger.info(
          "📄 First 200 chars of ICS:",
          icsContent.substring(0, 200),
        );

        // Get user settings for timezone
        let userSettings = await prisma.userSettings.findUnique({
          where: { userId: user.id },
        });

        // Create default settings if none exist
        if (!userSettings) {
          userSettings = await prisma.userSettings.create({
            data: { userId: user.id },
          });
        }

        const userTimezone = userSettings.timezone || "UTC";

        testParseResult = parseICSFile(icsContent, userTimezone);

        logger.ok("✅ ICS parsing completed:", {
          eventsFound: testParseResult.events.length,
          errorsCount: testParseResult.errors.length,
          calendarName: testParseResult.calendarName,
        });

        if (testParseResult.errors.length > 0) {
          logger.warn("⚠️ ICS parsing warnings:", testParseResult.errors);
        }
      } catch (error) {
        logger.error("💥 Complete error details:", error);
        logger.error(
          "💥 Error stack:",
          error instanceof Error ? error.stack : "No stack trace",
        );
        throw new Error(
          `Unable to fetch or parse calendar from URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      // Auto-create a new sync-only calendar for this subscription
      const calendarColor = color || "#6366f1";
      const calendar = await prisma.calendar.create({
        data: {
          name: name.trim(),
          color: calendarColor,
          isSyncOnly: true,
          isDefault: false,
          userId: user.id,
        },
      });

      // Create the subscription
      const subscription = await prisma.calendarSubscription.create({
        data: {
          name: name.trim(),
          url,
          userId: user.id,
          calendarId: calendar.id,
          lastSyncStatus: "pending",
        },
        include: {
          calendar: true,
        },
      });

      // Sync immediately on creation (non-blocking)
      syncCalendarSubscription(subscription).catch((err) => {
        logger.error("Initial sync failed for subscription:", subscription.id, err);
      });

      return subscription;
    },
    {
      body: t.Object({
        name: t.String(),
        url: t.String({ format: "uri" }),
        color: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Calendar Subscriptions"],
        summary: "Subscribe to an external calendar",
        description:
          "Creates a new sync-only calendar and subscribes to an external .ics feed. Events are read-only and synced automatically.",
      },
    },
  )

  .put(
    "/subscriptions/:id",
    async ({ params, body, user, request }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);
      const { id } = params;
      const { name, isActive, syncIntervalMinutes } =
        body as UpdateCalendarSubscriptionRequest;

      const subscription = await prisma.calendarSubscription.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      const updatedSubscription = await prisma.calendarSubscription.update({
        where: { id },
        data: {
          name: name || subscription.name,
          isActive: isActive !== undefined ? isActive : subscription.isActive,
          syncIntervalMinutes:
            syncIntervalMinutes || subscription.syncIntervalMinutes,
        },
        include: {
          calendar: true,
        },
      });

      return updatedSubscription;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
        syncIntervalMinutes: t.Optional(
          t.Number({ minimum: 5, maximum: 1440 }),
        ),
      }),
      detail: {
        tags: ["Calendar Subscriptions"],
        summary: "Update calendar subscription",
      },
    },
  )

  .delete(
    "/subscriptions/:id",
    async ({ params, user, query, request }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);
      const { id } = params;

      const subscription = await prisma.calendarSubscription.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      // Delete all synced events from this subscription
      await prisma.calendarEvent.deleteMany({
        where: {
          subscriptionId: id,
        },
      });

      // Delete the subscription
      await prisma.calendarSubscription.delete({
        where: { id },
      });

      // Delete the associated sync-only calendar
      await prisma.calendar.deleteMany({
        where: {
          id: subscription.calendarId,
          userId: user.id,
          isSyncOnly: true,
        },
      });

      return { success: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      query: t.Object({
        deleteEvents: t.Optional(t.Boolean()),
      }),
      detail: {
        tags: ["Calendar Subscriptions"],
        summary: "Delete calendar subscription",
        description:
          "Deletes a subscription. If deleteEvents is true, also deletes all synced events. Otherwise, events are kept but lose their sync association.",
      },
    },
  )

  .post(
    "/subscriptions/:id/sync",
    async ({ params, user, request }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);
      const { id } = params;

      const subscription = await prisma.calendarSubscription.findFirst({
        where: {
          id,
          userId: user.id,
        },
        include: {
          calendar: true,
        },
      });

      if (!subscription) {
        throw new Error("Subscription not found");
      }

      const syncResult = await syncCalendarSubscription(subscription);
      return syncResult;
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        tags: ["Calendar Subscriptions"],
        summary: "Manually trigger subscription sync",
      },
    },
  )

  .post(
    "/subscriptions/import-ics",
    async ({ body, user, request }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);
      const { calendarId, icsContent, fileName } = body as ImportIcsRequest;

      // Verify calendar belongs to user
      const calendar = await prisma.calendar.findFirst({
        where: {
          id: calendarId,
          userId: user.id,
        },
      });

      if (!calendar) {
        throw new Error("Calendar not found or not owned by user");
      }

      // Get user settings for timezone
      let userSettings = await prisma.userSettings.findUnique({
        where: { userId: user.id },
      });

      // Create default settings if none exist
      if (!userSettings) {
        userSettings = await prisma.userSettings.create({
          data: { userId: user.id },
        });
      }

      const userTimezone = userSettings.timezone || "UTC";
      logger.info("🔍 Parsing ICS content with user timezone:", userTimezone);
      const parseResult = parseICSFile(icsContent, userTimezone);

      if (parseResult.events.length === 0) {
        throw new Error("No valid events found in ICS file");
      }

      const createdEvents = [];
      const errors = [...parseResult.errors];

      for (const parsedEvent of parseResult.events) {
        try {
          // Check if event with same external ID already exists in this calendar
          const existingEvent = await prisma.calendarEvent.findFirst({
            where: {
              calendarId,
              externalId: parsedEvent.uid,
              isSynced: false, // Only check manually imported events
            },
          });

          if (existingEvent) {
            errors.push(
              `Event "${parsedEvent.title}" with UID ${parsedEvent.uid} already exists in calendar`,
            );
            continue;
          }

          const eventData = convertParsedEventToCalendarEvent(
            parsedEvent,
            user.id,
            calendarId,
            // No subscriptionId for manual import
          );

          const createdEvent = await prisma.calendarEvent.create({
            data: eventData,
          });

          createdEvents.push(createdEvent);
        } catch (error) {
          errors.push(
            `Failed to create event "${parsedEvent.title}": ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      const response: ImportIcsResponse = {
        success: true,
        eventsCreated: createdEvents.length,
        eventsTotal: parseResult.events.length,
        fileName: fileName || "unknown.ics",
        calendarName: parseResult.calendarName,
        errors: errors.length > 0 ? errors : undefined,
      };

      return response;
    },
    {
      body: t.Object({
        calendarId: t.String(),
        icsContent: t.String(),
        fileName: t.Optional(t.String()),
      }),
      detail: {
        tags: ["Calendar Subscriptions"],
        summary: "Import ICS file manually",
        description:
          "Manually imports events from an ICS file content into a specific calendar.",
      },
    },
  );

// Sync function for individual subscription
export async function syncCalendarSubscription(
  subscription: SyncableSubscription,
): Promise<CalendarSubscriptionSyncResponse> {
  const syncLog = await prisma.calendarSyncLog.create({
    data: {
      subscriptionId: subscription.id,
      status: "started",
    },
  });

  const startTime = Date.now();

  try {
    // Fetch the calendar

    const response = await fetch(subscription.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "text/calendar,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        ...(subscription.etag && { "If-None-Match": subscription.etag }),
        ...(subscription.lastModified && {
          "If-Modified-Since": subscription.lastModified,
        }),
      },
    });

    // Handle 304 Not Modified
    if (response.status === 304) {
      await prisma.calendarSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: "success",
          completedAt: new Date(),
          syncDurationMs: Date.now() - startTime,
          httpStatusCode: 304,
        },
      });

      await prisma.calendarSubscription.update({
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const icsContent = await response.text();

    // Get user settings for timezone
    let userSettings = await prisma.userSettings.findUnique({
      where: { userId: subscription.userId },
    });

    // Create default settings if none exist
    if (!userSettings) {
      userSettings = await prisma.userSettings.create({
        data: { userId: subscription.userId },
      });
    }

    const userTimezone = userSettings.timezone || "UTC";
    logger.info("🔍 Parsing ICS content with user timezone:", userTimezone);
    const parseResult = parseICSFile(icsContent, userTimezone);

    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    // Get current synced events for this subscription
    const currentEvents = await prisma.calendarEvent.findMany({
      where: {
        subscriptionId: subscription.id,
        isSynced: true,
      },
    });

    const currentEventsByUid = new Map(
      currentEvents.map((event) => [event.externalId!, event]),
    );

    const newEventUids = new Set(parseResult.events.map((event) => event.uid));

    // Process new/updated events
    for (const parsedEvent of parseResult.events) {
      const existingEvent = currentEventsByUid.get(parsedEvent.uid);

      if (!existingEvent) {
        // Create new event
        const eventData = convertParsedEventToCalendarEvent(
          parsedEvent,
          subscription.userId,
          subscription.calendarId,
          subscription.id,
        );

        await prisma.calendarEvent.create({ data: eventData });
        eventsAdded++;
      } else if (isEventModified(existingEvent, parsedEvent)) {
        // Update existing event
        await prisma.calendarEvent.update({
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
            timezone: parsedEvent.timezone || "UTC",
            syncedAt: new Date(),
          },
        });
        eventsUpdated++;
      }
    }

    // Delete events that no longer exist in the external calendar
    for (const [uid, event] of currentEventsByUid) {
      if (!newEventUids.has(uid)) {
        await prisma.calendarEvent.delete({
          where: { id: event.id },
        });
        eventsDeleted++;
      }
    }

    // Update subscription
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");

    await prisma.calendarSubscription.update({
      where: { id: subscription.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastErrorMessage: null,
        etag,
        lastModified,
      },
    });

    // Complete sync log
    await prisma.calendarSyncLog.update({
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await prisma.calendarSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "error",
        errorMessage,
        completedAt: new Date(),
        syncDurationMs: Date.now() - startTime,
      },
    });

    await prisma.calendarSubscription.update({
      where: { id: subscription.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "error",
        lastErrorMessage: errorMessage,
      },
    });

    throw error;
  }
}
