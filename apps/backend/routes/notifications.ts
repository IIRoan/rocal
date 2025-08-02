import { Elysia, t } from "elysia";
import { simpleNotificationService } from "../lib/simple-notification-service";
import { ValidationError } from "../lib/errors";
import { prisma } from "../lib/prisma";

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })

  .post(
    "/trigger-check",
    async ({ user }: any) => {
      try {
        // Manually trigger a notification check
        const status = await simpleNotificationService.getNotificationStatus();
        return {
          success: true,
          message: "Notification status retrieved successfully",
          pendingCount: status.pendingNotifications.length,
        };
      } catch (error) {
        throw new ValidationError("Failed to trigger reminder check");
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Manually trigger reminder check",
        description:
          "Manually triggers the system to check for events that need reminders",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Reminder check triggered successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "Error triggering reminder check",
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  )

  .get(
    "/event/:eventId",
    async ({ params, user }: any) => {
      const { eventId } = params;

      try {
        const notifications = await prisma.eventNotification.findMany({
          where: {
            eventId,
            event: {
              userId: user.id,
            },
          },
          orderBy: [{ notificationType: "asc" }, { minutesBefore: "asc" }],
        });

        return {
          success: true,
          notifications,
        };
      } catch (error) {
        throw new ValidationError("Failed to get event notifications");
      }
    },
    {
      auth: true,
      params: t.Object({
        eventId: t.String({
          description: "Event ID to get notifications for",
        }),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Get notifications for an event",
        description: "Gets all notification settings for a specific event",
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
                    notifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          eventId: { type: "string" },
                          notificationType: { type: "string" },
                          minutesBefore: { type: "integer" },
                          isEnabled: { type: "boolean" },
                          createdAt: { type: "string" },
                          updatedAt: { type: "string" },
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

  .put(
    "/event/:eventId",
    async ({ params, body, user }: any) => {
      const { eventId } = params;
      const { notifications } = body;

      try {
        // Get the event to get its start time
        const event = await prisma.calendarEvent.findFirst({
          where: { id: eventId, userId: user.id },
        });

        if (!event) {
          throw new ValidationError("Event not found or access denied");
        }

        // Use the new simple notification service to update notifications
        await simpleNotificationService.updateNotificationsForEvent(
          eventId,
          event.start,
          notifications,
        );

        return {
          success: true,
          message: "Event notifications updated successfully",
        };
      } catch (error: any) {
        throw new ValidationError(
          error.message || "Failed to update event notifications",
        );
      }
    },
    {
      auth: true,
      params: t.Object({
        eventId: t.String({
          description: "Event ID to update notifications for",
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
            }),
            isEnabled: t.Boolean({
              description: "Whether this notification is enabled",
            }),
          }),
          {
            description: "Array of notification settings",
          },
        ),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Update notifications for an event",
        description: "Updates all notification settings for a specific event",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event notifications updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
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
    "/status",
    async ({ user }: any) => {
      try {
        // Check if email service is configured
        const emailStatus = process.env.RESEND_API_KEY
          ? "✅ Configured"
          : "❌ Not configured";

        // Check database connection
        let dbStatus = "❌ Unavailable";
        try {
          await prisma.$queryRaw`SELECT 1`;
          dbStatus = "✅ Connected";
        } catch (dbError) {
          console.error("Database health check failed:", dbError);
        }

        // Get notification service status
        const notificationStatus =
          await simpleNotificationService.getNotificationStatus();

        return {
          status:
            dbStatus === "✅ Connected" && emailStatus === "✅ Configured"
              ? "operational"
              : "degraded",
          message: "Simple notification service status",
          services: {
            database: dbStatus,
            email: emailStatus,
            notificationService: notificationStatus.isRunning
              ? "✅ Running"
              : "❌ Stopped",
          },
          features: {
            email: emailStatus === "✅ Configured",
            reminders:
              dbStatus === "✅ Connected" && emailStatus === "✅ Configured",
          },
          checkInterval: "1 minute",
          pendingNotifications: notificationStatus.pendingNotifications.length,
          recentLogs: notificationStatus.recentLogs.length,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Status check error:", error);
        return {
          status: "error",
          message: "Failed to check notification service status",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Get notification service status",
        description:
          "Returns the current status and configuration of the notification service",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Notification service status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    message: { type: "string" },
                    features: {
                      type: "object",
                      properties: {
                        email: { type: "boolean" },
                        browser: { type: "boolean" },
                        reminders: { type: "boolean" },
                      },
                    },
                    checkInterval: { type: "string" },
                    queueProcessInterval: { type: "string" },
                  },
                },
              },
            },
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  )

  .post(
    "/event/:eventId/multiple",
    async ({ params, body, user }: any) => {
      const { eventId } = params;
      const { notificationTimes } = body;

      try {
        // Get the event to get its start time
        const event = await prisma.calendarEvent.findFirst({
          where: { id: eventId, userId: user.id },
        });

        if (!event) {
          throw new ValidationError("Event not found or access denied");
        }

        // Create notifications using the simple service
        const notifications = notificationTimes.map((minutes: number) => ({
          notificationType: "email" as const,
          minutesBefore: minutes,
          isEnabled: true,
        }));

        await simpleNotificationService.createNotificationsForEvent(
          eventId,
          event.start,
          notifications,
        );

        return {
          success: true,
          message: `Created ${notificationTimes.length} email notifications for event`,
          notificationTimes,
        };
      } catch (error: any) {
        throw new ValidationError(
          error.message || "Failed to create multiple notifications",
        );
      }
    },
    {
      auth: true,
      params: t.Object({
        eventId: t.String({
          description: "Event ID to create multiple notifications for",
        }),
      }),
      body: t.Object({
        notificationTimes: t.Array(
          t.Integer({
            description: "Minutes before event to send notification",
            minimum: 0,
          }),
          {
            description:
              "Array of minutes before event (e.g., [5, 60, 1440] for 5min, 1hr, 1day)",
            minItems: 1,
          },
        ),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Create multiple email notifications for an event",
        description:
          "Creates multiple email notifications for a specific event at different times (e.g., 5 minutes and 1 day before)",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Multiple notifications created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    notificationTimes: {
                      type: "array",
                      items: { type: "integer" },
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

  .get(
    "/debug",
    async ({ user }: any) => {
      try {
        // Get recent events with notifications for this user
        const recentEvents = await prisma.calendarEvent.findMany({
          where: {
            userId: user.id,
            start: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          include: {
            notifications: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        });

        // Get recent notification logs
        const recentLogs = await prisma.notificationLog.findMany({
          where: {
            userId: user.id,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        });

        // Get user settings
        const userSettings = await prisma.userSettings.findUnique({
          where: { userId: user.id },
        });

        // Get notification service status
        const notificationStatus =
          await simpleNotificationService.getNotificationStatus();

        return {
          environment: {
            RESEND_API_KEY: process.env.RESEND_API_KEY
              ? "✅ Set"
              : "❌ Missing",
            NODE_ENV: process.env.NODE_ENV,
          },
          user: {
            id: user.id,
            email: user.email,
          },
          userSettings: {
            emailNotifications: userSettings?.emailNotifications ?? true,
            browserNotifications: userSettings?.browserNotifications ?? true,
            defaultReminder: userSettings?.defaultReminder,
          },
          recentEvents: recentEvents.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start.toISOString(),
            notificationCount: event.notifications.length,
            notifications: event.notifications.map((n) => ({
              type: n.notificationType,
              minutesBefore: n.minutesBefore,
              enabled: n.isEnabled,
            })),
          })),
          recentNotificationLogs: recentLogs.map((log) => ({
            eventId: log.eventId,
            type: log.notificationType,
            minutesBefore: log.minutesBefore,
            sentAt: log.sentAt.toISOString(),
            status: log.status,
          })),
          notificationService: {
            isRunning: notificationStatus.isRunning,
            pendingNotifications:
              notificationStatus.pendingNotifications.length,
            recentLogs: notificationStatus.recentLogs.length,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Debug endpoint error:", error);
        throw new ValidationError("Failed to get debug information");
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Debug notification configuration",
        description:
          "Returns comprehensive debug information about notification configuration and recent activity",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Debug information",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    environment: { type: "object" },
                    user: { type: "object" },
                    userSettings: { type: "object" },
                    recentEvents: {
                      type: "array",
                      items: { type: "object" },
                    },
                    recentNotificationLogs: {
                      type: "array",
                      items: { type: "object" },
                    },
                    emailQueue: { type: "object" },
                    timestamp: { type: "string" },
                  },
                },
              },
            },
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  );
