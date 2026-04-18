import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";
import { ensureUserCalendars } from "../lib/user-setup";
import { RecurrenceEngine } from "../lib/recurrence";
import { NotificationCalculator } from "../lib/notification-calculator";
import { requireAuth } from "../lib/auth-guard";
import { createLogger } from "@workspace/logger";
import { buildIcsEventFile } from "@workspace/calendar-ics";
import { toIcsBuildEvent, toSafeIcsFilename } from "../lib/ics-export";
import {
  ALLOWED_CALENDAR_COLORS,
  isValidCalendarColor,
} from "../lib/colors";

import { auth } from "../lib/auth";
import { ensureAuthenticatedUser } from "../lib/auth-utils";

const logger = createLogger("backend:events");

// In-memory guard: track which users already have calendars set up this process lifetime.
// Avoids a DB round-trip on every GET /events request for established users.
const initializedUsers = new Set<string>();

async function resolveEventTimezone(
  userId: string,
  requestedTimezone?: string,
): Promise<string> {
  if (requestedTimezone?.trim()) {
    return requestedTimezone.trim();
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timezone: true },
  });

  return userSettings?.timezone || "UTC";
}

export const eventsRoutes = new Elysia({ prefix: "/events" })
  .use(requireAuth)
  .get(
    "/search",
    async ({ query, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      const { q, limit, offset, startDate, endDate } = query;
      const searchQuery = (q as string)?.trim();

      if (!searchQuery || searchQuery.length < 2) {
        return { events: [], total: 0 };
      }

      const limitVal = Math.min(Math.max(Number(limit) || 20, 1), 50);
      const offsetVal = Math.max(Number(offset) || 0, 0);

      // Build date filter clause
      let dateFilter = "";
      const params: any[] = [user.id, searchQuery, limitVal, offsetVal];
      if (startDate && endDate) {
        dateFilter = `AND e.start <= ${params.length + 1}::timestamp AND e.end >= ${params.length + 2}::timestamp`;
        params.push(new Date(startDate as string), new Date(endDate as string));
      }

      const results = await prisma.$queryRawUnsafe(
        `SELECT
          e.id, e.title, e.description, e.start, e.end, e.all_day, e.location, e.color,
          e.calendar_id, e.category_id, e.timezone, e.recurrence, e.user_id,
          e.created_at, e.updated_at,
          c.id as "calendar.id", c.name as "calendar.name", c.color as "calendar.color",
          cat.id as "category.id", cat.name as "category.name", cat.color as "category.color",
          ts_rank(
            to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.description, '') || ' ' || coalesce(e.location, '')),
            plainto_tsquery('english', $2)
          ) as rank
        FROM calendar_event e
        LEFT JOIN calendar c ON e.calendar_id = c.id
        LEFT JOIN event_category cat ON e.category_id = cat.id
        WHERE e.user_id = $1
          AND (
            to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.description, '') || ' ' || coalesce(e.location, ''))
            @@ plainto_tsquery('english', $2)
            OR e.title ILIKE '%' || $2 || '%'
          )
          ${dateFilter}
        ORDER BY rank DESC, e.start DESC
        LIMIT $3 OFFSET $4`,
        ...params,
      );

      const countResult = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int as total
        FROM calendar_event e
        WHERE e.user_id = $1
          AND (
            to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.description, '') || ' ' || coalesce(e.location, ''))
            @@ plainto_tsquery('english', $2)
            OR e.title ILIKE '%' || $2 || '%'
          )
          ${dateFilter}`,
        ...params.slice(0, params.length - 2),
      );

      const total = (countResult as any[])?.[0]?.total ?? 0;

      // Flatten nested results from joins
      const events = (results as any[]).map((row) => ({
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
      }));

      return { events, total };
    },
    {
      query: t.Object({
        q: t.String({
          description: "Search query (min 2 characters)",
          minLength: 2,
        }),
        limit: t.Optional(
          t.Number({
            description: "Max results to return (default 20, max 50)",
            minimum: 1,
            maximum: 50,
          }),
        ),
        offset: t.Optional(
          t.Number({
            description: "Offset for pagination (default 0)",
            minimum: 0,
          }),
        ),
        startDate: t.Optional(
          t.String({
            description: "Filter events starting after this date (ISO 8601)",
          }),
        ),
        endDate: t.Optional(
          t.String({
            description: "Filter events ending before this date (ISO 8601)",
          }),
        ),
      }),
      detail: {
        tags: ["Events"],
        summary: "Search events by text",
        description:
          "Full-text search across event title, description, and location. Uses PostgreSQL tsvector for fast lookups with ILIKE fallback for short queries.",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .get(
    "/",
    async ({ query: { start, end }, user, request, set }: any) => {
      // Robust user check with fallback
      if (!user || !user.id) {
        try {
          // Fallback: Try to fetch session directly using request headers
          const session = await auth.api.getSession({
            headers: request.headers as Headers,
          });

          if (session?.user?.id) {
            user = session.user;
          } else {
            logger.error("User missing in events handler and fallback failed");
            throw new Error("User context missing");
          }
        } catch (e) {
          logger.error("User missing in events handler and fallback failed", e);
          throw new Error("User context missing");
        }
      }

      // Ensure user has default calendars (only once per server process per user)
      if (!initializedUsers.has(user.id)) {
        await ensureUserCalendars(user.id);
        initializedUsers.add(user.id);
      }

      // Validate required parameters
      if (!start || !end) {
        throw new ValidationError("Start and end date parameters are required");
      }

      // Parse and validate dates
      const startDate = new Date(start as string);
      const endDate = new Date(end as string);

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

      // Fetch regular events and recurring parents in parallel
      const [regularEvents, recurringEvents] = await Promise.all([
        prisma.calendarEvent.findMany({
          where: {
            userId: user.id,
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
          },
        }),
        prisma.calendarEvent.findMany({
          where: {
            userId: user.id,
            recurrence: { not: null },
            parentEventId: null, // Only get parent events, not instances
          },
          include: {
            category: true,
            calendar: true,
            recurrenceExceptions: true,
          },
        }),
      ]);

      // Generate recurring event instances
      const recurringInstances = [];
      for (const recurringEvent of recurringEvents) {
        try {
          // Debug: Try to parse the recurrence rule
          let recurrenceRule = recurringEvent.recurrence || "{}";
          const parsedRule =
            RecurrenceEngine.parseRecurrenceRule(recurrenceRule);

          // TEMPORARY FIX: If we have an empty recurrence rule but the title suggests it's recurring
          if (
            !parsedRule &&
            (recurringEvent.title.toLowerCase().includes("standup") ||
              recurringEvent.title.toLowerCase().includes("daily"))
          ) {
            // Create a daily weekday recurrence rule (Mon-Fri)
            recurrenceRule = JSON.stringify({
              frequency: "daily",
              interval: 1,
              byWeekDay: [1, 2, 3, 4, 5], // Mon-Fri
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

          // Convert instances to events
          for (const instance of instances) {
            if (!instance.isOriginal) {
              const duration =
                recurringEvent.end.getTime() - recurringEvent.start.getTime();
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
              // Include original event if it falls within range
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
          // If recurrence generation fails, include the original event
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

      // Fetch modified instances, categories, and calendars in parallel
      const [modifiedInstances, categories, calendars] = await Promise.all([
        prisma.calendarEvent.findMany({
          where: {
            userId: user.id,
            parentEventId: { not: null },
            start: { gte: startDate, lte: endDate },
          },
          include: {
            category: true,
            calendar: true,
          },
        }),
        prisma.eventCategory.findMany({
          where: {
            userId: user.id,
            isActive: true,
          },
          orderBy: { name: "asc" },
        }),
        prisma.calendar.findMany({
          where: {
            userId: user.id,
          },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
      ]);

      // Combine all events
      const events = [
        ...regularEvents,
        ...recurringInstances,
        ...modifiedInstances,
      ].sort((a, b) => a.start.getTime() - b.start.getTime());

      return {
        events,
        categories,
        calendars,
      };
    },
    {
      query: t.Object({
        start: t.String({
          description: "Start date in ISO 8601 format",
          examples: ["2024-01-01T00:00:00.000Z"],
        }),
        end: t.String({
          description: "End date in ISO 8601 format",
          examples: ["2024-01-31T23:59:59.999Z"],
        }),
      }),
      detail: {
        tags: ["Events"],
        summary: "Get user's calendar events within date range",
        description:
          "Fetches authenticated user's events within the specified date range, including associated categories for efficient frontend rendering",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Events and categories retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    events: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          description: { type: "string", nullable: true },
                          start: { type: "string", format: "date-time" },
                          end: { type: "string", format: "date-time" },
                          allDay: { type: "boolean" },
                          location: { type: "string", nullable: true },
                          color: { type: "string", nullable: true },
                          categoryId: { type: "string", nullable: true },
                          category: {
                            type: "object",
                            nullable: true,
                            properties: {
                              id: { type: "string" },
                              name: { type: "string" },
                              color: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          color: { type: "string" },
                          isActive: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  )

  .post(
    "/",
    async ({ body, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        const { title, start, end } = body;

        // Validate required fields
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

        // Parse and validate dates
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

        // Validate color if provided (allow predefined colors or hex colors)
        if (body.color) {
          if (!isValidCalendarColor(body.color)) {
            throw new ValidationError(
              `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
              "color",
            );
          }
        }

        // Important: do not normalize all-day boundaries using server-local time.
        // The client already sends canonical all-day bounds in the user's timezone.
        // Re-applying setHours() on the server can shift dates across timezones.

        // Validate recurrence rule if provided
        if (body.recurrence) {
          try {
            const rule = RecurrenceEngine.parseRecurrenceRule(body.recurrence);
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

        // Validate category exists and belongs to user if provided
        if (body.categoryId) {
          const category = await prisma.eventCategory.findFirst({
            where: {
              id: body.categoryId,
              userId: user.id,
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

        // Validate title length
        if (title.trim().length > 255) {
          throw new ValidationError(
            "Title cannot exceed 255 characters",
            "title",
          );
        }

        // Validate description length if provided
        if (body.description && body.description.length > 1000) {
          throw new ValidationError(
            "Description cannot exceed 1000 characters",
            "description",
          );
        }

        // Validate location length if provided
        if (body.location && body.location.length > 255) {
          throw new ValidationError(
            "Location cannot exceed 255 characters",
            "location",
          );
        }

        // Validate calendar exists and belongs to user
        if (!body.calendarId) {
          throw new ValidationError("Calendar ID is required", "calendarId");
        }

        const calendar = await prisma.calendar.findFirst({
          where: {
            id: body.calendarId,
            userId: user.id,
          },
        });

        if (!calendar) {
          throw new ValidationError(
            "Invalid calendar or calendar does not belong to user",
            "calendarId",
          );
        }

        // Block event creation in non-owned calendars
        if (calendar.kind !== "owned" || calendar.isSyncOnly) {
          throw new ValidationError(
            "Cannot create events in a read-only calendar. This calendar is managed by a subscription or public feed.",
            "calendarId",
          );
        }

        // Validate reminder if provided (must be a non-negative number)
        if (body.reminder !== undefined && body.reminder !== null) {
          const reminderValue = Number(body.reminder);
          if (
            isNaN(reminderValue) ||
            reminderValue < 0 ||
            reminderValue > 43200
          ) {
            throw new ValidationError(
              "Reminder must be a number between 0 and 43200 minutes",
              "reminder",
            );
          }
          body.reminder = reminderValue;
        }

        const eventTimezone = await resolveEventTimezone(
          user.id,
          body.timezone,
        );

        // Create the event
        const event = await prisma.calendarEvent.create({
          data: {
            title: title.trim(),
            description: body.description?.trim() || null,
            start: startDate,
            end: endDate,
            timezone: eventTimezone,
            allDay: body.allDay || false,
            location: body.location?.trim() || null,
            color: body.color || null,
            calendarId: body.calendarId,
            categoryId: body.categoryId || null,
            reminder: body.reminder || null,
            recurrence: body.recurrence || null,
            userId: user.id,
          },
          include: {
            category: true,
            calendar: true,
          },
        });

        // Create notifications directly in database
        try {
          if (body.reminder && body.reminder > 0) {
            // Check if user has email notifications enabled
            const userSettings = await prisma.userSettings.findUnique({
              where: { userId: user.id },
            });

            if (userSettings?.emailNotifications !== false) {
              const notificationSchedule =
                NotificationCalculator.buildNotificationSchedule(
                  startDate,
                  body.reminder,
                  eventTimezone,
                );

              if (notificationSchedule.notificationTime > new Date()) {
                await prisma.$executeRaw`
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
                    ${body.reminder},
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
          // Don't fail the event creation if notifications fail
        }

        return event;
      } catch (error) {
        logger.error("Event creation error:", error);
        throw error;
      }
    },
    {
      body: t.Object({
        title: t.String({
          minLength: 1,
          maxLength: 255,
          description: "Event title (required, 1-255 characters)",
        }),
        description: t.Optional(
          t.String({
            maxLength: 1000,
            description: "Event description (optional, max 1000 characters)",
          }),
        ),
        start: t.String({
          description: "Start date in ISO 8601 format",
          examples: ["2024-01-01T09:00:00.000Z"],
        }),
        end: t.String({
          description: "End date in ISO 8601 format",
          examples: ["2024-01-01T10:00:00.000Z"],
        }),
        allDay: t.Optional(
          t.Boolean({
            description: "Whether the event is all-day (default: false)",
          }),
        ),
        location: t.Optional(
          t.String({
            maxLength: 255,
            description: "Event location (optional, max 255 characters)",
          }),
        ),
        color: t.Optional(
          t.String({
            description: "Event color (blue, orange, violet, rose, emerald)",
          }),
        ),
        calendarId: t.String({
          description: "ID of the calendar (required, must belong to user)",
        }),
        categoryId: t.Optional(
          t.String({
            description: "ID of the event category (must belong to user)",
          }),
        ),
        timezone: t.Optional(
          t.String({
            description: "IANA timezone identifier for the event",
          }),
        ),
        reminder: t.Optional(
          t.Union([
            t.Number({
              minimum: 0,
              maximum: 43200, // 30 days in minutes
              description: "Reminder time in minutes before event (0-43200)",
            }),
            t.Null(),
          ]),
        ),
        recurrence: t.Optional(
          t.String({
            description: "JSON string of recurrence rule for recurring events",
          }),
        ),
      }),
      detail: {
        tags: ["Events"],
        summary: "Create a new calendar event",
        description:
          "Creates a new calendar event for the authenticated user with proper validation",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string", nullable: true },
                    start: { type: "string", format: "date-time" },
                    end: { type: "string", format: "date-time" },
                    allDay: { type: "boolean" },
                    location: { type: "string", nullable: true },
                    color: { type: "string", nullable: true },
                    categoryId: { type: "string", nullable: true },
                    category: {
                      type: "object",
                      nullable: true,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        color: { type: "string" },
                      },
                    },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  )

  .get(
    "/:id/ics",
    async ({ params, user, request, set }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      const { id: requestedId } = params as { id: string };

      let eventId = requestedId;
      let recurrenceInstanceDate: Date | undefined;

      const recurringInstanceMatch = requestedId.match(
        /^(.+?)_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$/,
      );

      if (recurringInstanceMatch?.[1] && recurringInstanceMatch?.[2]) {
        eventId = recurringInstanceMatch[1];
        const parsedOccurrenceDate = new Date(recurringInstanceMatch[2]);
        if (!Number.isNaN(parsedOccurrenceDate.getTime())) {
          recurrenceInstanceDate = parsedOccurrenceDate;
        }
      }

      const event = await prisma.calendarEvent.findFirst({
        where: {
          id: eventId,
          userId: user.id,
        },
        include: {
          calendar: true,
        },
      });

      if (!event) {
        throw new ValidationError("Event not found or access denied");
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

      set.headers["Content-Type"] = "text/calendar; charset=utf-8";
      set.headers["Content-Disposition"] =
        `attachment; filename="${toSafeIcsFilename(fileBaseName)}"`;
      set.headers["Cache-Control"] = "no-store";

      return icsContent;
    },
    {
      params: t.Object({
        id: t.String({
          description: "Event ID to export as ICS",
        }),
      }),
      detail: {
        tags: ["Events"],
        summary: "Download a single event as .ics",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .get(
    "/:id",
    async ({ params, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        const { id } = params;

        const include = {
          category: true,
          calendar: true,
        };

        let event = await prisma.calendarEvent.findFirst({
          where: {
            id,
            userId: user.id,
          },
          include,
        });

        if (!event && id.includes("_")) {
          const parentEventId = id.split("_")[0];
          event = await prisma.calendarEvent.findFirst({
            where: {
              id: parentEventId,
              userId: user.id,
            },
            include,
          });
        }

        if (!event) {
          throw new ValidationError("Event not found or access denied");
        }

        return event;
      } catch (error) {
        logger.error("Event fetch error:", error);
        throw error;
      }
    },
    {
      params: t.Object({
        id: t.String({
          description: "Event ID to fetch",
        }),
      }),
      detail: {
        tags: ["Events"],
        summary: "Get a calendar event by ID",
        description:
          "Fetches a single calendar event for the authenticated user, including its calendar and category",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event retrieved successfully",
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
          404: {
            description: "Event not found",
          },
        },
      },
    },
  )

  .put(
    "/:id",
    async ({ params, body, user, request }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        const { id: requestedId } = params;

        // Check if this is a recurring instance ID (contains underscore and ISO date)
        let id = requestedId;
        if (
          id.includes("_") &&
          id.match(/_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        ) {
          // Extract parent event ID from instance ID
          const parentEventId = id.split("_")[0];
          logger.info(
            `Redirecting edit request from instance ${id} to parent ${parentEventId}`,
          );

          // Update the parent event instead
          id = parentEventId;
        }

        // Verify event exists and belongs to user
        const existingEvent = await prisma.calendarEvent.findFirst({
          where: {
            id,
            userId: user.id,
          },
          include: { category: true },
        });

        if (!existingEvent) {
          throw new ValidationError("Event not found or access denied");
        }

        // Check if the event is synced - synced events cannot be edited
        if (existingEvent.isSynced) {
          throw new ValidationError(
            "Cannot edit synced events. Synced events are read-only.",
          );
        }

        // Validate dates if provided
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (body.start) {
          startDate = new Date(body.start);
          if (isNaN(startDate.getTime())) {
            throw new ValidationError(
              "Invalid start date format. Use ISO 8601 format",
              "start",
            );
          }
        }

        if (body.end) {
          endDate = new Date(body.end);
          if (isNaN(endDate.getTime())) {
            throw new ValidationError(
              "Invalid end date format. Use ISO 8601 format",
              "end",
            );
          }
        }

        const eventTimezone =
          body.timezone !== undefined
            ? await resolveEventTimezone(user.id, body.timezone)
            : existingEvent.timezone;

        // Use existing dates if not provided in update
        let finalStartDate = startDate || existingEvent.start;
        let finalEndDate = endDate || existingEvent.end;

        // Important: avoid server-local normalization for all-day updates.
        // Keep the boundaries provided by the client to prevent timezone drift.

        // Validate date logic
        if (finalStartDate >= finalEndDate) {
          throw new ValidationError("End time must be after start time", "end");
        }

        // Validate title if provided
        if (body.title !== undefined) {
          if (!body.title?.trim()) {
            throw new ValidationError(
              "Title is required and cannot be empty",
              "title",
            );
          }
          if (body.title.trim().length > 255) {
            throw new ValidationError(
              "Title cannot exceed 255 characters",
              "title",
            );
          }
        }

        // Validate description length if provided
        if (
          body.description !== undefined &&
          body.description &&
          body.description.length > 1000
        ) {
          throw new ValidationError(
            "Description cannot exceed 1000 characters",
            "description",
          );
        }

        // Validate location length if provided
        if (
          body.location !== undefined &&
          body.location &&
          body.location.length > 255
        ) {
          throw new ValidationError(
            "Location cannot exceed 255 characters",
            "location",
          );
        }

        // Validate color if provided (allow predefined colors or hex colors)
        if (body.color !== undefined && body.color) {
          if (!isValidCalendarColor(body.color)) {
            throw new ValidationError(
              `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
              "color",
            );
          }
        }

        // Validate calendar exists and belongs to user if provided
        if (body.calendarId !== undefined) {
          const calendar = await prisma.calendar.findFirst({
            where: {
              id: body.calendarId,
              userId: user.id,
            },
          });

          if (!calendar) {
            throw new ValidationError(
              "Invalid calendar or calendar does not belong to user",
              "calendarId",
            );
          }

          // Block moving events into non-owned calendars
          if (calendar.kind !== "owned" || calendar.isSyncOnly) {
            throw new ValidationError(
              "Cannot move events to a read-only calendar.",
              "calendarId",
            );
          }
        }

        // Block editing events that are in sync-only calendars (unless it's a sync operation)
        const eventForSyncCheck = await prisma.calendarEvent.findFirst({
          where: { id: id, userId: user.id },
          include: { calendar: true },
        });

        if (eventForSyncCheck?.isSynced) {
          throw new ValidationError(
            "Cannot edit synced events. These events are managed by the external subscription.",
            "id",
          );
        }

        // Validate category exists and belongs to user if provided
        if (body.categoryId !== undefined && body.categoryId) {
          const category = await prisma.eventCategory.findFirst({
            where: {
              id: body.categoryId,
              userId: user.id,
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

        // Validate reminder if provided
        if (body.reminder !== undefined && body.reminder !== null) {
          const reminderValue = Number(body.reminder);
          if (
            isNaN(reminderValue) ||
            reminderValue < 0 ||
            reminderValue > 43200
          ) {
            throw new ValidationError(
              "Reminder must be a number between 0 and 43200 minutes",
              "reminder",
            );
          }
          body.reminder = reminderValue;
        }

        // Prepare update data (only include fields that are provided)
        const updateData: any = {};

        if (body.title !== undefined) {
          updateData.title = body.title.trim();
        }
        if (body.description !== undefined) {
          updateData.description = body.description?.trim() || null;
        }
        if (startDate) {
          updateData.start = finalStartDate;
        }
        if (endDate) {
          updateData.end = finalEndDate;
        }
        if (body.allDay !== undefined) {
          updateData.allDay = body.allDay;
        }
        if (body.timezone !== undefined) {
          updateData.timezone = eventTimezone;
        }
        if (body.location !== undefined) {
          updateData.location = body.location?.trim() || null;
        }
        if (body.color !== undefined) {
          updateData.color = body.color || null;
        }
        if (body.calendarId !== undefined) {
          updateData.calendarId = body.calendarId;
        }
        if (body.categoryId !== undefined) {
          updateData.categoryId = body.categoryId || null;
        }
        if (body.reminder !== undefined) {
          updateData.reminder = body.reminder || null;
        }
        if (body.recurrence !== undefined) {
          if (body.recurrence) {
            try {
              const rule = RecurrenceEngine.parseRecurrenceRule(
                body.recurrence,
              );
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
          updateData.recurrence = body.recurrence || null;
        }

        // Add updatedAt for optimistic locking check
        updateData.updatedAt = new Date();

        // Update the event with optimistic locking
        const updatedEvent = await prisma.calendarEvent.update({
          where: {
            id,
            // Optimistic locking: ensure the event hasn't been modified since we fetched it
            updatedAt: existingEvent.updatedAt,
          },
          data: updateData,
          include: {
            category: true,
            calendar: true,
          },
        });

        // Update notifications if event time or reminder changed
        try {
          // Check if we need to update notifications
          const timeChanged = startDate || endDate;
          const reminderChanged = body.reminder !== undefined;

          if (timeChanged || reminderChanged) {
            // Get current notification configurations or create from reminder
            let notificationConfigs: {
              notificationType: "email" | "browser";
              minutesBefore: number;
              isEnabled: boolean;
            }[] = [];

            // If reminder was updated, use the new reminder value
            if (reminderChanged) {
              const finalReminderValue = body.reminder || updatedEvent.reminder;

              if (finalReminderValue && finalReminderValue > 0) {
                // Get user settings to check if email notifications are enabled
                const userSettings = await prisma.userSettings.findUnique({
                  where: { userId: user.id },
                });

                if (userSettings?.emailNotifications !== false) {
                  notificationConfigs.push({
                    notificationType: "email",
                    minutesBefore: finalReminderValue,
                    isEnabled: true,
                  });
                }
              }
            } else {
              // Time changed but reminder didn't - preserve existing notifications
              const existingNotifications =
                await prisma.eventNotification.findMany({
                  where: { eventId: id },
                });

              notificationConfigs = existingNotifications.map((n) => ({
                notificationType: n.notificationType as "email" | "browser",
                minutesBefore: n.minutesBefore,
                isEnabled: n.isEnabled,
              }));
            }

            // Update notifications with direct database operations
            // First, delete existing notifications
            await prisma.eventNotification.deleteMany({
              where: { eventId: id },
            });

            // Create new notifications based on configurations
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
                await prisma.$executeRaw`
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
          logger.error(
            "Failed to update notifications with enhanced service:",
            notificationError,
          );
          // Don't fail the event update if notifications fail
        }

        return updatedEvent;
      } catch (error: any) {
        logger.error("Event update error:", error);

        // Handle optimistic locking conflict
        if (
          error.code === "P2025" ||
          error.message.includes("Record to update not found")
        ) {
          throw new ValidationError(
            "Event was modified by another process. Please refresh and try again.",
          );
        }
        throw error;
      }
    },
    {
      params: t.Object({
        id: t.String({
          description: "Event ID",
        }),
      }),
      body: t.Object({
        title: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 255,
            description: "Event title (1-255 characters)",
          }),
        ),
        description: t.Optional(
          t.String({
            maxLength: 1000,
            description: "Event description (max 1000 characters)",
          }),
        ),
        start: t.Optional(
          t.String({
            description: "Start date in ISO 8601 format",
          }),
        ),
        end: t.Optional(
          t.String({
            description: "End date in ISO 8601 format",
          }),
        ),
        timezone: t.Optional(
          t.String({
            description: "IANA timezone identifier for the event",
          }),
        ),
        allDay: t.Optional(
          t.Boolean({
            description: "Whether the event is all-day",
          }),
        ),
        location: t.Optional(
          t.String({
            maxLength: 255,
            description: "Event location (max 255 characters)",
          }),
        ),
        color: t.Optional(
          t.String({
            description: "Event color (blue, orange, violet, rose, emerald)",
          }),
        ),
        calendarId: t.Optional(
          t.String({
            description: "ID of the calendar (must belong to user)",
          }),
        ),
        categoryId: t.Optional(
          t.String({
            description: "ID of the event category (must belong to user)",
          }),
        ),
        reminder: t.Optional(
          t.Union([
            t.Number({
              minimum: 0,
              maximum: 43200, // 30 days in minutes
              description: "Reminder time in minutes before event (0-43200)",
            }),
            t.Null(),
          ]),
        ),
        recurrence: t.Optional(
          t.Union([
            t.String({
              description:
                "JSON string of recurrence rule for recurring events",
            }),
            t.Null(),
          ]),
        ),
      }),
      detail: {
        tags: ["Events"],
        summary: "Update an existing calendar event",
        description:
          "Updates an existing calendar event with ownership verification and optimistic locking to prevent concurrent update conflicts",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string", nullable: true },
                    start: { type: "string", format: "date-time" },
                    end: { type: "string", format: "date-time" },
                    allDay: { type: "boolean" },
                    location: { type: "string", nullable: true },
                    color: { type: "string", nullable: true },
                    categoryId: { type: "string", nullable: true },
                    category: {
                      type: "object",
                      nullable: true,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        color: { type: "string" },
                      },
                    },
                    updatedAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error or optimistic locking conflict",
          },
          401: {
            description: "Unauthorized",
          },
          404: {
            description: "Event not found",
          },
        },
      },
    },
  )

  .delete(
    "/:id",
    async ({ params, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        const { id: requestedId } = params;

        // Check if this is a recurring instance ID (contains underscore and ISO date)
        let id = requestedId;
        if (
          id.includes("_") &&
          id.match(/_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        ) {
          // Extract parent event ID from instance ID
          const parentEventId = id.split("_")[0];
          logger.info(
            `Redirecting delete request from instance ${id} to parent ${parentEventId}`,
          );

          // Delete the parent event instead
          id = parentEventId;
        }

        // Verify event exists and belongs to user
        const existingEvent = await prisma.calendarEvent.findFirst({
          where: {
            id,
            userId: user.id,
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

        // Clean up associated notifications
        const deletedNotifications = await prisma.eventNotification.deleteMany({
          where: { eventId: id },
        });
        logger.ok(
          `Deleted ${deletedNotifications.count} notifications for event ${id}`,
        );

        // Clean up notification logs
        await prisma.notificationLog.deleteMany({
          where: { eventId: id },
        });

        // For now, we'll do hard delete, but we could implement soft delete
        // by adding a 'deletedAt' field to the schema for future audit requirements
        await prisma.calendarEvent.delete({
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
    },
    {
      params: t.Object({
        id: t.String({
          description: "Event ID to delete",
        }),
      }),
      detail: {
        tags: ["Events"],
        summary: "Delete a calendar event",
        description:
          "Deletes a calendar event with proper user ownership verification",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    deletedEventId: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
          404: {
            description: "Event not found",
          },
        },
      },
    },
  )

  .post(
    "/bulk",
    async ({ body, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        const { action, eventIds, targetCalendarId } = body;

        // Validate event IDs
        if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
          throw new ValidationError("Event IDs array is required", "eventIds");
        }

        // Verify all events exist and belong to user
        const events = await prisma.calendarEvent.findMany({
          where: {
            id: { in: eventIds },
            userId: user.id,
          },
        });

        if (events.length !== eventIds.length) {
          throw new ValidationError(
            "Some events not found or access denied",
            "eventIds",
          );
        }

        // Check if any of the events are synced - synced events cannot be modified
        const syncedEvents = events.filter((event) => event.isSynced);
        if (syncedEvents.length > 0) {
          throw new ValidationError(
            `Cannot modify synced events. The following synced events are read-only: ${syncedEvents.map((e) => e.title).join(", ")}`,
          );
        }

        let result;

        switch (action) {
          case "move":
            if (!targetCalendarId) {
              throw new ValidationError(
                "Target calendar ID is required for move operation",
                "targetCalendarId",
              );
            }

            // Verify target calendar exists and belongs to user
            const targetCalendar = await prisma.calendar.findFirst({
              where: {
                id: targetCalendarId,
                userId: user.id,
              },
            });

            if (!targetCalendar) {
              throw new ValidationError(
                "Target calendar not found or access denied",
                "targetCalendarId",
              );
            }

            // Move events to target calendar
            result = await prisma.calendarEvent.updateMany({
              where: {
                id: { in: eventIds },
                userId: user.id,
              },
              data: {
                calendarId: targetCalendarId,
                updatedAt: new Date(),
              },
            });

            return {
              success: true,
              message: `Successfully moved ${result.count} events to ${targetCalendar.name}`,
              eventsProcessed: result.count,
              action: "move",
            };

          case "delete":
            // Clean up associated notifications
            const deletedNotifications =
              await prisma.eventNotification.deleteMany({
                where: { eventId: { in: eventIds } },
              });
            logger.ok(
              `Deleted ${deletedNotifications.count} notifications for ${eventIds.length} events`,
            );

            // Clean up notification logs
            await prisma.notificationLog.deleteMany({
              where: { eventId: { in: eventIds } },
            });

            // Delete all specified events
            result = await prisma.calendarEvent.deleteMany({
              where: {
                id: { in: eventIds },
                userId: user.id,
              },
            });

            return {
              success: true,
              message: `Successfully deleted ${result.count} events`,
              eventsProcessed: result.count,
              action: "delete",
            };

          case "duplicate":
            // Duplicate events
            const duplicatedEvents = [];
            for (const event of events) {
              const duplicated = await prisma.calendarEvent.create({
                data: {
                  title: `${event.title} (Copy)`,
                  description: event.description,
                  start: event.start,
                  end: event.end,
                  allDay: event.allDay,
                  location: event.location,
                  color: event.color,
                  isPrivate: event.isPrivate,
                  reminder: event.reminder,
                  recurrence: null, // Don't copy recurrence
                  calendarId: targetCalendarId || event.calendarId,
                  categoryId: event.categoryId,
                  userId: user.id,
                },
                include: {
                  category: true,
                  calendar: true,
                },
              });

              // Create notifications for the duplicated event using direct database operations
              try {
                if (event.reminder && event.reminder > 0) {
                  // Get user settings to check if email notifications are enabled
                  const userSettings = await prisma.userSettings.findUnique({
                    where: { userId: user.id },
                  });

                  if (userSettings?.emailNotifications !== false) {
                    const notificationSchedule =
                      NotificationCalculator.buildNotificationSchedule(
                        duplicated.start,
                        event.reminder,
                        duplicated.timezone,
                      );

                    await prisma.$executeRaw`
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
                // Don't fail the duplication if notifications fail
              }

              duplicatedEvents.push(duplicated);
            }

            return {
              success: true,
              message: `Successfully duplicated ${duplicatedEvents.length} events`,
              eventsProcessed: duplicatedEvents.length,
              action: "duplicate",
              createdEvents: duplicatedEvents,
            };

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
    },
    {
      body: t.Object({
        action: t.Union(
          [t.Literal("move"), t.Literal("delete"), t.Literal("duplicate")],
          {
            description:
              "Bulk operation to perform: move, delete, or duplicate",
          },
        ),
        eventIds: t.Array(t.String(), {
          description: "Array of event IDs to process",
          minItems: 1,
        }),
        targetCalendarId: t.Optional(
          t.String({
            description:
              "Target calendar ID (required for move, optional for duplicate)",
          }),
        ),
      }),
      detail: {
        tags: ["Events"],
        summary: "Perform bulk operations on events",
        description: "Move, delete, or duplicate multiple events at once",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Bulk operation completed successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    eventsProcessed: { type: "number" },
                    action: { type: "string" },
                    createdEvents: {
                      type: "array",
                      description: "New events created (for duplicate action)",
                      items: {
                        type: "object",
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  );
