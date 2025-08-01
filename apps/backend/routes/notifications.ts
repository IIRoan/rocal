import { Elysia, t } from "elysia";
import { redisNotificationService } from "../lib/redis-notification-service";
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
        await redisNotificationService.sendTestNotification(user.id, eventId);
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
        await redisNotificationService.sendTestEmailNotification(
          user.id,
          eventId
        );
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
        const pendingEmails =
          await redisNotificationService.getPendingEmailNotifications(user.id);
        return {
          success: true,
          emails: pendingEmails,
          count: pendingEmails.length,
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
        await redisNotificationService.triggerReminderCheck();
        return {
          success: true,
          message: "Reminder check triggered successfully",
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
        // We'll keep using the old notification service for CRUD operations on event notifications
        // since that's just database operations, not the actual notification sending
        const { notificationService } = await import(
          "../lib/notification-service"
        );
        await notificationService.updateEventNotifications(
          eventId,
          user.id,
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
        // Get stored notifications from Redis backup queue
        const { redisClient } = await import("../lib/redis");
        const backupKey = `pending_notifications:${user.id}`;

        // Get all notifications and clear the list
        const notificationStrings = await redisClient.lRange(backupKey, 0, -1);
        if (notificationStrings.length > 0) {
          await redisClient.del(backupKey);
        }

        const notifications = notificationStrings
          .map((str) => {
            try {
              return JSON.parse(str);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        return {
          success: true,
          notifications,
          message:
            notifications.length > 0
              ? `Retrieved ${notifications.length} pending notifications`
              : "No pending notifications. Connect to /api/notifications/stream for real-time delivery",
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
        // Check if Redis is available
        let redisStatus = "❌ Unavailable";
        try {
          const { redisClient } = await import("../lib/redis");
          await redisClient.ping();
          redisStatus = "✅ Connected";
        } catch (redisError) {
          console.error("Redis health check failed:", redisError);
        }

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

        return {
          status:
            redisStatus === "✅ Connected" && dbStatus === "✅ Connected"
              ? "operational"
              : "degraded",
          message: "Notification service status",
          services: {
            redis: redisStatus,
            database: dbStatus,
            email: emailStatus,
          },
          features: {
            email: emailStatus === "✅ Configured",
            browser: redisStatus === "✅ Connected",
            reminders:
              redisStatus === "✅ Connected" && dbStatus === "✅ Connected",
          },
          checkInterval: "2 minutes",
          queueProcessInterval: "30 seconds",
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

            // Subscribe to user's notifications
            redisNotificationService.subscribeToUserNotifications(
              user.id,
              (notification) => {
                const sseData = `data: ${JSON.stringify({ type: "notification", data: notification })}\n\n`;
                controller.enqueue(sseData);
              }
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
              redisNotificationService.unsubscribeFromUserNotifications(
                user.id
              );
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
        await redisNotificationService.createMultipleNotificationsForEvent(
          eventId,
          user.id,
          notificationTimes
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

  .get(
    "/debug",
    async ({ user }: any) => {
      return {
        environment: {
          REDIS_URL: process.env.REDIS_URL ? "✅ Set" : "❌ Missing",
          RESEND_API_KEY: process.env.RESEND_API_KEY ? "✅ Set" : "❌ Missing",
        },
        user: {
          id: user.id,
          email: user.email,
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      auth: true,
      detail: {
        tags: ["Notifications"],
        summary: "Debug notification configuration",
        description:
          "Returns debug information about notification configuration",
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
