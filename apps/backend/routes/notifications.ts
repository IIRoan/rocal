import { Elysia, t } from "elysia";
import { EnhancedNotificationService } from "../lib/enhanced-notification-service";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from "../lib/errors";
import { prisma } from "../lib/prisma";

// Get enhanced notification service instance
const enhancedNotificationService = EnhancedNotificationService.getInstance();

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
        (current.resetTime - now) / 1000
      ).toString();
      throw new ValidationError(
        `Rate limit exceeded. Try again in ${Math.ceil((current.resetTime - now) / 1000)} seconds.`
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
      "Invalid notification type. Must be 'email' or 'browser'."
    );
  }

  if (typeof config.minutesBefore !== "number" || config.minutesBefore < 0) {
    throw new ValidationError("minutesBefore must be a non-negative number.");
  }

  if (config.minutesBefore > 43200) {
    // 30 days in minutes
    throw new ValidationError(
      "minutesBefore cannot exceed 30 days (43200 minutes)."
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
  const event = await prisma.calendarEvent.findFirst({
    where: { id: eventId, userId },
    select: { id: true, start: true, title: true },
  });

  if (!event) {
    throw new NotFoundError("Event not found or access denied");
  }

  return event;
}

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })

  .get(
    "/event/:eventId",
    async ({ params, user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.GET_NOTIFICATIONS)({ request, set, user });

        const { eventId } = params;

        // Validate event ownership
        await validateEventOwnership(eventId, user.id);

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
      auth: true,
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
    }
  )

  .put(
    "/event/:eventId",
    async ({ params, body, user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({ request, set, user });

        const { eventId } = params;
        const { notifications } = body;

        // Validate event ownership
        const event = await validateEventOwnership(eventId, user.id);

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
          (n) => `${n.notificationType}-${n.minutesBefore}`
        );
        const uniqueKeys = new Set(configKeys);
        if (configKeys.length !== uniqueKeys.size) {
          throw new ValidationError(
            "Duplicate notification configurations are not allowed"
          );
        }

        // Use enhanced notification service to update notifications
        const result =
          await enhancedNotificationService.updateNotificationsForEvent(
            eventId,
            event.start,
            notifications
          );

        return {
          success: true,
          message: "Event notifications updated successfully",
          data: {
            eventId,
            created: result.created.length,
            skipped: result.skipped.length,
            details: {
              createdNotifications: result.created.map((n) => ({
                id: n.id,
                type: n.notificationType,
                minutesBefore: n.minutesBefore,
                notificationTime: n.notificationTime.toISOString(),
                isEnabled: n.isEnabled,
              })),
              skippedConfigurations: result.skipped.map((s) => ({
                config: s.config,
                reason: s.reason,
              })),
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
      auth: true,
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
              }
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
          }
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
    }
  )

  .delete(
    "/event/:eventId",
    async ({ params, user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({ request, set, user });

        const { eventId } = params;

        // Validate event ownership
        await validateEventOwnership(eventId, user.id);

        // Use enhanced notification service to delete notifications
        const deletedCount =
          await enhancedNotificationService.deleteNotificationsForEvent(
            eventId
          );

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
      auth: true,
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
    }
  )

  .get(
    "/status",
    async ({ user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.STATUS_CHECK)({ request, set, user });

        // Check if email service is configured
        const emailStatus = process.env.RESEND_API_KEY
          ? "configured"
          : "not_configured";

        // Check database connection
        let dbStatus = "unavailable";
        try {
          await prisma.$queryRaw`SELECT 1`;
          dbStatus = "connected";
        } catch (dbError) {
          console.error("Database health check failed:", dbError);
        }

        // Get enhanced notification service status
        const notificationStatus =
          await enhancedNotificationService.getNotificationStatus();

        // Calculate overall system status
        const isOperational =
          dbStatus === "connected" &&
          emailStatus === "configured" &&
          notificationStatus.isRunning;

        return {
          success: true,
          data: {
            status: isOperational ? "operational" : "degraded",
            message: "Enhanced notification service status",
            services: {
              database: dbStatus,
              email: emailStatus,
              notificationService: notificationStatus.isRunning
                ? "running"
                : "stopped",
            },
            capabilities: {
              emailNotifications: emailStatus === "configured",
              browserNotifications: true, // Always available
              backgroundProcessing: notificationStatus.isRunning,
            },
            metrics: {
              pendingNotifications: notificationStatus.pendingNotifications,
              processedCount: notificationStatus.processedCount,
              failedCount: notificationStatus.failedCount,
              retryQueueSize: notificationStatus.retryQueueSize,
              lastProcessedAt:
                notificationStatus.lastProcessedAt?.toISOString(),
              nextRetryAt: notificationStatus.nextRetryAt?.toISOString(),
            },
            configuration: {
              checkInterval: "60 seconds",
              maxRetries: 3,
              retryDelays: "2-15 minutes (based on error type)",
            },
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Status check error:", error);
        return {
          success: false,
          error: "Failed to check notification service status",
          message: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Get enhanced notification service status",
        description:
          "Returns comprehensive status information about the enhanced notification service including metrics, configuration, and health checks",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Notification service status retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        status: {
                          type: "string",
                          enum: ["operational", "degraded"],
                        },
                        message: { type: "string" },
                        services: {
                          type: "object",
                          properties: {
                            database: { type: "string" },
                            email: { type: "string" },
                            notificationService: { type: "string" },
                          },
                        },
                        capabilities: {
                          type: "object",
                          properties: {
                            emailNotifications: { type: "boolean" },
                            browserNotifications: { type: "boolean" },
                            backgroundProcessing: { type: "boolean" },
                          },
                        },
                        metrics: {
                          type: "object",
                          properties: {
                            pendingNotifications: { type: "integer" },
                            processedCount: { type: "integer" },
                            failedCount: { type: "integer" },
                            retryQueueSize: { type: "integer" },
                            lastProcessedAt: {
                              type: "string",
                              format: "date-time",
                            },
                            nextRetryAt: {
                              type: "string",
                              format: "date-time",
                            },
                          },
                        },
                        configuration: { type: "object" },
                        timestamp: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          429: { description: "Rate limit exceeded" },
        },
      },
    }
  )

  .post(
    "/event/:eventId/test",
    async ({ params, user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.CREATE_NOTIFICATIONS)({ request, set, user });

        const { eventId } = params;

        // Validate event ownership
        const event = await validateEventOwnership(eventId, user.id);

        // Create a test notification (5 minutes from now)
        const testNotificationTime = new Date(Date.now() + 5 * 60 * 1000);

        const testNotification = await prisma.eventNotification.create({
          data: {
            eventId,
            notificationType: "email",
            minutesBefore: 5,
            notificationTime: testNotificationTime,
            isEnabled: true,
            isSent: false,
          },
        });

        return {
          success: true,
          message: "Test notification scheduled successfully",
          data: {
            eventId,
            eventTitle: event.title,
            testNotification: {
              id: testNotification.id,
              type: testNotification.notificationType,
              scheduledFor: testNotification.notificationTime.toISOString(),
              minutesFromNow: 5,
            },
            note: "Test notification will be sent in 5 minutes if the notification service is running",
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
        console.error("Failed to create test notification:", error);
        throw new ValidationError("Failed to create test notification");
      }
    },
    {
      auth: true,
      params: t.Object({
        eventId: t.String({
          description: "Event ID to create test notification for",
          minLength: 1,
        }),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Create test notification for an event",
        description:
          "Creates a test email notification that will be sent in 5 minutes to verify the notification system is working",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Test notification created successfully",
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
                        eventTitle: { type: "string" },
                        testNotification: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            type: { type: "string" },
                            scheduledFor: {
                              type: "string",
                              format: "date-time",
                            },
                            minutesFromNow: { type: "integer" },
                          },
                        },
                        note: { type: "string" },
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
    }
  )

  .get(
    "/debug",
    async ({ user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.DEBUG_ACCESS)({ request, set, user });

        // Get recent events with notifications for this user
        const recentEvents = await prisma.calendarEvent.findMany({
          where: {
            userId: user.id,
            start: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          include: {
            notifications: {
              orderBy: { minutesBefore: "asc" },
            },
          },
          orderBy: {
            start: "desc",
          },
          take: 10,
        });

        // Get recent notification logs
        const recentLogs = await prisma.notificationLog.findMany({
          where: {
            userId: user.id,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        });

        // Get user settings
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId: user.id },
        });

        // Get enhanced notification service status
        const notificationStatus =
          await enhancedNotificationService.getNotificationStatus();

        return {
          success: true,
          data: {
            environment: {
              RESEND_API_KEY: process.env.RESEND_API_KEY
                ? "configured"
                : "missing",
              NODE_ENV: process.env.NODE_ENV || "development",
              EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || "default",
            },
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
            },
            userSettings: {
              emailNotifications: userSettings?.emailNotifications ?? true,
              browserNotifications: userSettings?.browserNotifications ?? true,
              defaultReminder: userSettings?.defaultReminder,
              timezone: userSettings?.timezone || "UTC",
              timeFormat: userSettings?.timeFormat || "12h",
            },
            recentEvents: recentEvents.map((event) => ({
              id: event.id,
              title: event.title,
              start: event.start.toISOString(),
              end: event.end.toISOString(),
              allDay: event.allDay,
              notificationCount: event.notifications.length,
              notifications: event.notifications.map((n) => ({
                id: n.id,
                type: n.notificationType,
                minutesBefore: n.minutesBefore,
                notificationTime: n.notificationTime.toISOString(),
                enabled: n.isEnabled,
                sent: n.isSent,
              })),
            })),
            recentNotificationLogs: recentLogs.map((log) => ({
              id: log.id,
              eventId: log.eventId,
              type: log.notificationType,
              minutesBefore: log.minutesBefore,
              sentAt: log.sentAt.toISOString(),
              status: log.status,
            })),
            enhancedNotificationService: {
              isRunning: notificationStatus.isRunning,
              pendingNotifications: notificationStatus.pendingNotifications,
              processedCount: notificationStatus.processedCount,
              failedCount: notificationStatus.failedCount,
              retryQueueSize: notificationStatus.retryQueueSize,
              lastProcessedAt:
                notificationStatus.lastProcessedAt?.toISOString(),
              nextRetryAt: notificationStatus.nextRetryAt?.toISOString(),
              recentErrors: notificationStatus.errors.slice(-5).map((e) => ({
                notificationId: e.notificationId,
                eventId: e.eventId,
                error: e.error,
                timestamp: e.timestamp.toISOString(),
                retryCount: e.retryCount,
              })),
            },
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Debug endpoint error:", error);
        throw new ValidationError("Failed to get debug information");
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Get comprehensive debug information",
        description:
          "Returns detailed debug information about notification configuration, recent activity, and system status for troubleshooting",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Debug information retrieved successfully" },
          401: { description: "Unauthorized" },
          429: { description: "Rate limit exceeded" },
        },
      },
    }
  )

  .post(
    "/cleanup",
    async ({ body, user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.DEBUG_ACCESS)({ request, set, user });

        // Only allow admin users to run cleanup (you might want to add proper admin check)
        // For now, we'll allow any authenticated user but log the action
        console.log(
          `Manual cleanup initiated by user ${user.id} (${user.email})`
        );

        const { retentionDays = 30 } = body;

        // Validate retention days
        if (
          typeof retentionDays !== "number" ||
          retentionDays < 1 ||
          retentionDays > 365
        ) {
          throw new ValidationError("retentionDays must be between 1 and 365");
        }

        // Run cleanup
        const result =
          await enhancedNotificationService.cleanupOldNotifications(
            retentionDays
          );

        return {
          success: true,
          message: "Notification cleanup completed successfully",
          data: {
            deletedLogs: result.deletedLogs,
            deletedNotifications: result.deletedNotifications,
            cleanupDuration: result.cleanupDuration,
            retentionCutoff: result.retentionCutoff.toISOString(),
            retentionDays,
            maintenanceResults: result.maintenanceResults,
            initiatedBy: {
              userId: user.id,
              email: user.email,
            },
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Manual cleanup failed:", error);
        throw new ValidationError(
          `Cleanup failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    },
    {
      auth: true,
      body: t.Object({
        retentionDays: t.Optional(
          t.Integer({
            description: "Number of days to retain logs (default: 30)",
            minimum: 1,
            maximum: 365,
            default: 30,
          })
        ),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Manually trigger notification cleanup",
        description:
          "Manually triggers the cleanup process to remove old notification logs and sent notifications with configurable retention period",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Cleanup completed successfully",
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
                        deletedLogs: { type: "integer" },
                        deletedNotifications: { type: "integer" },
                        cleanupDuration: { type: "integer" },
                        retentionCutoff: {
                          type: "string",
                          format: "date-time",
                        },
                        retentionDays: { type: "integer" },
                        maintenanceResults: {
                          type: "object",
                          properties: {
                            vacuumedTables: {
                              type: "array",
                              items: { type: "string" },
                            },
                            reindexedTables: {
                              type: "array",
                              items: { type: "string" },
                            },
                            analyzedTables: {
                              type: "array",
                              items: { type: "string" },
                            },
                          },
                        },
                        initiatedBy: {
                          type: "object",
                          properties: {
                            userId: { type: "string" },
                            email: { type: "string" },
                          },
                        },
                        timestamp: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Validation error" },
          401: { description: "Unauthorized" },
          429: { description: "Rate limit exceeded" },
        },
      },
    }
  )

  .get(
    "/cleanup/status",
    async ({ user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.STATUS_CHECK)({ request, set, user });

        // Get cleanup status
        const cleanupStatus = enhancedNotificationService.getCleanupStatus();

        return {
          success: true,
          data: {
            cleanup: cleanupStatus,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Failed to get cleanup status:", error);
        throw new ValidationError("Failed to retrieve cleanup status");
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Get cleanup status",
        description:
          "Returns the current status of automatic cleanup including scheduling information and last cleanup statistics",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Cleanup status retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        cleanup: {
                          type: "object",
                          properties: {
                            isScheduled: { type: "boolean" },
                            nextRunEstimate: {
                              type: "string",
                              format: "date-time",
                            },
                            lastCleanupStats: {
                              type: "object",
                              properties: {
                                timestamp: {
                                  type: "string",
                                  format: "date-time",
                                },
                                deletedLogs: { type: "integer" },
                                deletedNotifications: { type: "integer" },
                                duration: { type: "integer" },
                              },
                            },
                          },
                        },
                        timestamp: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          429: { description: "Rate limit exceeded" },
        },
      },
    }
  )

  .get(
    "/cleanup/metrics",
    async ({ user, request, set }: any) => {
      try {
        // Apply rate limiting
        rateLimit(RATE_LIMITS.STATUS_CHECK)({ request, set, user });

        // Get detailed cleanup metrics
        const metrics = await enhancedNotificationService.getCleanupMetrics();

        return {
          success: true,
          data: {
            ...metrics,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        if (
          error instanceof ValidationError ||
          error instanceof UnauthorizedError
        ) {
          throw error;
        }
        console.error("Failed to get cleanup metrics:", error);
        throw new ValidationError("Failed to retrieve cleanup metrics");
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Get detailed cleanup metrics",
        description:
          "Returns comprehensive cleanup metrics including current data sizes, cleanup history, and recommended actions for monitoring and optimization",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Cleanup metrics retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        currentDataSize: {
                          type: "object",
                          properties: {
                            notificationLogs: { type: "integer" },
                            eventNotifications: { type: "integer" },
                            oldestLogDate: {
                              type: "string",
                              format: "date-time",
                            },
                            oldestNotificationDate: {
                              type: "string",
                              format: "date-time",
                            },
                          },
                        },
                        cleanupHistory: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              timestamp: {
                                type: "string",
                                format: "date-time",
                              },
                              deletedLogs: { type: "integer" },
                              deletedNotifications: { type: "integer" },
                              duration: { type: "integer" },
                              retentionDays: { type: "integer" },
                            },
                          },
                        },
                        recommendedActions: {
                          type: "array",
                          items: { type: "string" },
                        },
                        timestamp: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          429: { description: "Rate limit exceeded" },
        },
      },
    }
  );
