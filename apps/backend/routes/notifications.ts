import { Elysia, t } from "elysia";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "../lib/errors";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-guard";
import { auth } from "../lib/auth";
import { ensureAuthenticatedUser } from "../lib/auth-utils";

// Rate limiting configuration
const RATE_LIMITS = {
  GET_NOTIFICATIONS: { requests: 100, windowMs: 60000 }, // 100 requests per minute
  UPDATE_NOTIFICATIONS: { requests: 20, windowMs: 60000 }, // 20 updates per minute
  CREATE_NOTIFICATIONS: { requests: 30, windowMs: 60000 }, // 30 creates per minute
  STATUS_CHECK: { requests: 50, windowMs: 60000 }, // 50 status checks per minute
  DEBUG_ACCESS: { requests: 10, windowMs: 60000 }, // 10 debug requests per minute
};

// Simple in-memory rate limiter (for production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limiting middleware
 */
function rateLimit(limit: { requests: number; windowMs: number }) {
  return ({ request, set, user }: any) => {
    if (!user) {
      set.status = 401;
      throw new UnauthorizedError("Authentication required");
    }

    const key = `${user.id}:${request.url}`;
    const now = Date.now();
    const windowStart = now - limit.windowMs;

    // Clean up old entries
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < windowStart) {
        rateLimitStore.delete(k);
      }
    }

    const current = rateLimitStore.get(key);
    if (!current || current.resetTime < windowStart) {
      rateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs });
      return;
    }

    if (current.count >= limit.requests) {
      set.status = 429;
      set.headers["Retry-After"] = Math.ceil(
        (current.resetTime - now) / 1000,
      ).toString();
      throw new ValidationError(
        `Rate limit exceeded. Try again in ${Math.ceil((current.resetTime - now) / 1000)} seconds.`,
      );
    }

    current.count++;
  };
}

/**
 * Validate notification configuration
 */
function validateNotificationConfig(config: any): void {
  if (
    !config.notificationType ||
    !["email", "browser"].includes(config.notificationType)
  ) {
    throw new ValidationError(
      "Invalid notification type. Must be 'email' or 'browser'.",
    );
  }

  if (typeof config.minutesBefore !== "number" || config.minutesBefore < 0) {
    throw new ValidationError("minutesBefore must be a non-negative number.");
  }

  if (config.minutesBefore > 43200) {
    // 30 days in minutes
    throw new ValidationError(
      "minutesBefore cannot exceed 30 days (43200 minutes).",
    );
  }

  if (typeof config.isEnabled !== "boolean") {
    throw new ValidationError("isEnabled must be a boolean value.");
  }
}

/**
 * Validate event ownership
 */
async function validateEventOwnership(eventId: string, userId: string) {
  // Check if this is a recurring instance ID or synced event - just return null for these
  if (
    eventId.includes("_") &&
    eventId.match(/_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  ) {
    return null; // Recurring instances don't have notifications
  }

  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true, start: true, title: true, isSynced: true },
  });

  if (!event) {
    throw new NotFoundError("Event not found or access denied");
  }

  // Synced events don't have notifications either
  if (event.isSynced) {
    return null;
  }

  return event;
}

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })
  .use(requireAuth)
  .get(
    "/event/:eventId",
    async ({ params, user, request, set }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.GET_NOTIFICATIONS)({ request, set, user });

        const { eventId } = params;

        // Validate event ownership
        const event = await validateEventOwnership(eventId, user.id);

        // If event is null (synced or recurring instance), return empty notifications
        if (!event) {
          return {
            success: true,
            data: {
              eventId,
              notifications: [],
              count: 0,
            },
          };
        }

        // Get notifications for the event
        const notifications = await prisma.eventNotification.findMany({
          where: {
            eventId,
            event: {
              userId: user.id,
            },
          },
          orderBy: [{ notificationType: "asc" }, { minutesBefore: "asc" }],
          select: {
            id: true,
            eventId: true,
            notificationType: true,
            minutesBefore: true,
            notificationTime: true,
            isEnabled: true,
            isSent: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return {
          success: true,
          data: {
            eventId,
            notifications: notifications.map((n) => ({
              ...n,
              notificationTime: n.notificationTime.toISOString(),
              createdAt: n.createdAt.toISOString(),
              updatedAt: n.updatedAt.toISOString(),
            })),
            count: notifications.length,
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof NotFoundError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Failed to get event notifications:", error);
        throw new ValidationError("Failed to retrieve event notifications");
      }
    },
    {
      params: t.Object({
        eventId: t.String({
          description: "Event ID to get notifications for",
          minLength: 1,
        }),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Get notifications for an event",
        description:
          "Retrieves all notification settings for a specific event with enhanced validation and rate limiting",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event notifications retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        eventId: { type: "string" },
                        notifications: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              eventId: { type: "string" },
                              notificationType: {
                                type: "string",
                                enum: ["email", "browser"],
                              },
                              minutesBefore: { type: "integer", minimum: 0 },
                              notificationTime: {
                                type: "string",
                                format: "date-time",
                              },
                              isEnabled: { type: "boolean" },
                              isSent: { type: "boolean" },
                              createdAt: {
                                type: "string",
                                format: "date-time",
                              },
                              updatedAt: {
                                type: "string",
                                format: "date-time",
                              },
                            },
                          },
                        },
                        count: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          404: { description: "Event not found" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
  )

  .put(
    "/event/:eventId",
    async ({ params, body, user, request, set }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({ request, set, user });

        const { eventId } = params;
        const { notifications } = body;

        // Validate event ownership
        const event = await validateEventOwnership(eventId, user.id);

        // If event is null (synced or recurring instance), return success without doing anything
        if (!event) {
          return {
            success: true,
            message: "No notifications to update for this event type",
          };
        }

        // Validate notification configurations
        if (!Array.isArray(notifications)) {
          throw new ValidationError("notifications must be an array");
        }

        // Validate each notification configuration
        for (const config of notifications) {
          validateNotificationConfig(config);
        }

        // Check for duplicate notification configurations
        const configKeys = notifications.map(
          (n) => `${n.notificationType}-${n.minutesBefore}`,
        );
        const uniqueKeys = new Set(configKeys);
        if (configKeys.length !== uniqueKeys.size) {
          throw new ValidationError(
            "Duplicate notification configurations are not allowed",
          );
        }

        // Delete existing notifications for this event
        await prisma.eventNotification.deleteMany({
          where: { eventId },
        });

        // Create new notifications, but skip any that would be in the past or for past events
        const createdNotifications = [] as Array<{
          id: string;
          notificationType: string;
          minutesBefore: number;
          notificationTime: Date;
          isEnabled: boolean;
        }>;
        const skippedConfigurations: Array<{
          notificationType: string;
          minutesBefore: number;
          reason: string;
        }> = [];

        const now = new Date();
        const eventIsInPast = event.start <= now;

        if (eventIsInPast) {
          // Entirely skip creating notifications for past events
          return {
            success: true,
            message: "Event is in the past; notifications skipped",
            data: {
              eventId,
              created: 0,
              skipped: notifications.length,
              details: {
                createdNotifications: [],
                skippedConfigurations: notifications.map((n) => ({
                  notificationType: n.notificationType,
                  minutesBefore: n.minutesBefore,
                  reason: "event_in_past",
                })),
              },
            },
          };
        }

        for (const config of notifications) {
          if (!config.isEnabled) {
            skippedConfigurations.push({
              notificationType: config.notificationType,
              minutesBefore: config.minutesBefore,
              reason: "disabled",
            });
            continue;
          }

          const notificationTime = new Date(
            event.start.getTime() - config.minutesBefore * 60 * 1000,
          );
          if (notificationTime <= now) {
            skippedConfigurations.push({
              notificationType: config.notificationType,
              minutesBefore: config.minutesBefore,
              reason: "notification_time_in_past",
            });
            continue;
          }

          const notification = await prisma.eventNotification.create({
            data: {
              eventId,
              notificationType: config.notificationType,
              minutesBefore: config.minutesBefore,
              notificationTime,
              isEnabled: true,
              isSent: false,
            },
          });
          createdNotifications.push(notification as any);
        }

        return {
          success: true,
          message: "Event notifications updated successfully",
          data: {
            eventId,
            created: createdNotifications.length,
            skipped: skippedConfigurations.length,
            details: {
              createdNotifications: createdNotifications.map((n) => ({
                id: n.id,
                type: n.notificationType,
                minutesBefore: n.minutesBefore,
                notificationTime: n.notificationTime.toISOString(),
                isEnabled: true,
              })),
              skippedConfigurations,
            },
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof NotFoundError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Failed to update event notifications:", error);
        throw new ValidationError("Failed to update event notifications");
      }
    },
    {
      params: t.Object({
        eventId: t.String({
          description: "Event ID to update notifications for",
          minLength: 1,
        }),
      }),
      body: t.Object({
        notifications: t.Array(
          t.Object({
            notificationType: t.Union(
              [t.Literal("browser"), t.Literal("email")],
              {
                description: "Type of notification",
              },
            ),
            minutesBefore: t.Integer({
              description: "Minutes before event to send notification",
              minimum: 0,
              maximum: 43200, // 30 days
            }),
            isEnabled: t.Boolean({
              description: "Whether this notification is enabled",
            }),
          }),
          {
            description: "Array of notification settings",
            maxItems: 20, // Reasonable limit
          },
        ),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Update notifications for an event",
        description:
          "Updates all notification settings for a specific event using the enhanced notification service with comprehensive validation",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Event notifications updated successfully" },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          404: { description: "Event not found" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
  )

  .delete(
    "/event/:eventId",
    async ({ params, user, request, set }: any) => {
      // Robust user check with fallback
      user = await ensureAuthenticatedUser(user, request as Request);

      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({ request, set, user });

        const { eventId } = params;

        // Validate event ownership
        const event = await validateEventOwnership(eventId, user.id);

        // If event is null (synced or recurring instance), return success without doing anything
        if (!event) {
          return {
            success: true,
            message: "No notifications to delete for this event type",
            deletedCount: 0,
          };
        }

        // Delete notifications directly from database
        const deleteResult = await prisma.eventNotification.deleteMany({
          where: { eventId },
        });
        const deletedCount = deleteResult.count;

        return {
          success: true,
          message: `Successfully deleted ${deletedCount} notifications for event`,
          data: {
            eventId,
            deletedCount,
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof NotFoundError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Failed to delete event notifications:", error);
        throw new ValidationError("Failed to delete event notifications");
      }
    },
    {
      params: t.Object({
        eventId: t.String({
          description: "Event ID to delete notifications for",
          minLength: 1,
        }),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Delete all notifications for an event",
        description:
          "Deletes all notification settings for a specific event using the enhanced notification service",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event notifications deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    data: {
                      type: "object",
                      properties: {
                        eventId: { type: "string" },
                        deletedCount: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          404: { description: "Event not found" },
          429: { description: "Rate limit exceeded" },
        },
      },
    },
  );

// Status, debug, and cleanup routes removed - handled by separate notification server
