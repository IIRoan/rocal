import { Elysia, t } from "elysia";
import { simpleNotificationService } from "../lib/simple-notification-service";
import { ValidationError } from "../lib/errors";
import { prisma } from "../lib/prisma";

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })
  .post(
    "/test",
    async ({ body, user }: any) => {
      const { eventId } = body;

      if (!eventId) {
        throw new ValidationError("Event ID is required", "eventId");
      }

      try {
        await simpleNotificationService.sendTestNotification(user.id, eventId);
        return {
          success: true,
          message: "Test notification sent successfully",
        };
      } catch (error) {
        throw new ValidationError("Failed to send test notification");
      }
    },
    {
      auth: true,
      body: t.Object({
        eventId: t.String({
          description: "Event ID to send test notification for",
        }),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Send test notification for an event",
        description: "Sends a test reminder notification for a specific event",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Test notification sent successfully",
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
    }
  )

  .post(
    "/test-email",
    async ({ body, user }: any) => {
      const { eventId } = body;

      if (!eventId) {
        throw new ValidationError("Event ID is required", "eventId");
      }

      try {
        // Verify the event exists and belongs to the user first
        const event = await prisma.calendarEvent.findFirst({
          where: {
            id: eventId,
            userId: user.id,
          },
        });

        if (!event) {
          throw new ValidationError(
            "Event not found or access denied",
            "eventId"
          );
        }

        // Send immediate email test for specific event
        await simpleNotificationService.sendTestNotification(user.id, eventId);
        return {
          success: true,
          message: "Test email notification sent successfully",
          eventTitle: event.title,
        };
      } catch (error) {
        console.error("Test email error:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new ValidationError(
          `Failed to send test email notification: ${errorMessage}`
        );
      }
    },
    {
      auth: true,
      body: t.Object({
        eventId: t.String({
          description: "Event ID to send test email notification for",
        }),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Send test email notification for an event",
        description:
          "Sends a test email reminder notification for a specific event immediately",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Test email notification sent successfully",
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
    }
  )

  .get(
    "/email/pending",
    async ({ user }: any) => {
      try {
        // Get pending notifications from the new service
        const status = await simpleNotificationService.getNotificationStatus();
        const userNotifications = status.pendingNotifications.filter(
          (n: any) => n.userEmail === user.email
        );

        return {
          success: true,
          emails: userNotifications,
          count: userNotifications.length,
        };
      } catch (error) {
        throw new ValidationError("Failed to get pending email notifications");
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Get pending email notifications",
        description:
          "Gets pending email notifications in the queue for the current user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Pending email notifications retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    emails: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          to: { type: "string" },
                          subject: { type: "string" },
                          eventId: { type: "string" },
                          userId: { type: "string" },
                          minutesBefore: { type: "integer" },
                        },
                      },
                    },
                    count: { type: "integer" },
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
    }
  )

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
    }
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
    }
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
          notifications
        );

        return {
          success: true,
          message: "Event notifications updated successfully",
        };
      } catch (error: any) {
        throw new ValidationError(
          error.message || "Failed to update event notifications"
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
              }
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
          }
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
    }
  )

  .get(
    "/browser/pending",
    async ({ user }: any) => {
      try {
        // Browser notifications are not implemented in the simple service yet
        // Return empty array for now
        return {
          success: true,
          notifications: [],
          message:
            "Browser notifications not implemented in simple service yet",
        };
      } catch (error) {
        console.error("Failed to get pending notifications:", error);
        throw new ValidationError(
          "Failed to get pending browser notifications"
        );
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Get pending browser notifications",
        description: "Gets pending browser notifications for the current user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Pending notifications retrieved successfully",
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
                          title: { type: "string" },
                          body: { type: "string" },
                          icon: { type: "string" },
                          badge: { type: "string" },
                          tag: { type: "string" },
                          data: {
                            type: "object",
                            properties: {
                              eventId: { type: "string" },
                              userId: { type: "string" },
                              type: { type: "string" },
                            },
                          },
                        },
                      },
                    },
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
    }
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
    }
  )

  .get(
    "/stream",
    async ({ user, set }: any) => {
      try {
        // Set SSE headers
        set.headers = {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Cache-Control",
        };

        // Create a readable stream for SSE
        const stream = new ReadableStream({
          start(controller) {
            // Send initial connection message
            controller.enqueue(
              `data: ${JSON.stringify({ type: "connected", message: "Connected to notifications" })}\n\n`
            );

            // Send keepalive every 30 seconds
            const keepAlive = setInterval(() => {
              controller.enqueue(
                `data: ${JSON.stringify({ type: "keepalive", timestamp: Date.now() })}\n\n`
              );
            }, 30000);

            // Cleanup on close
            return () => {
              clearInterval(keepAlive);
            };
          },
        });

        return new Response(stream);
      } catch (error) {
        console.error("SSE connection error:", error);
        throw new ValidationError("Failed to establish SSE connection");
      }
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Stream real-time notifications",
        description:
          "Establishes a Server-Sent Events connection for real-time browser notifications",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "SSE stream established",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string",
                },
              },
            },
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    }
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
          notifications
        );

        return {
          success: true,
          message: `Created ${notificationTimes.length} email notifications for event`,
          notificationTimes,
        };
      } catch (error: any) {
        throw new ValidationError(
          error.message || "Failed to create multiple notifications"
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
          }
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
    }
  )

  .post(
    "/create-test-event",
    async ({ body, user }: any) => {
      const { minutesFromNow = 5 } = body;

      try {
        const result = await simpleNotificationService.createTestEvent(
          user.id,
          minutesFromNow
        );
        return {
          success: true,
          ...result,
        };
      } catch (error: any) {
        throw new ValidationError(
          error.message || "Failed to create test event"
        );
      }
    },
    {
      auth: true,
      body: t.Object({
        minutesFromNow: t.Optional(
          t.Integer({
            description: "Minutes from now when the event should start",
            minimum: 1,
            maximum: 60,
            default: 5,
          })
        ),
      }),
      detail: {
        tags: ["Notifications"],
        summary: "Create test event with notifications",
        description:
          "Creates a test event with email notifications for debugging purposes",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Test event created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    eventId: { type: "string" },
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
    }
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
    }
  );
