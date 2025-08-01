import { prisma } from "./prisma";
import { Resend } from "resend";
import type { CalendarEvent, User, UserSettings } from "../generated/prisma";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable is required");
}

const resend = new Resend(process.env.RESEND_API_KEY);

export interface NotificationEvent extends CalendarEvent {
  user: User;
}

export class SimpleNotificationService {
  private static instance: SimpleNotificationService;
  private isRunning = false;

  private constructor() {}

  public static getInstance(): SimpleNotificationService {
    if (!SimpleNotificationService.instance) {
      SimpleNotificationService.instance = new SimpleNotificationService();
    }
    return SimpleNotificationService.instance;
  }

  // Start the notification checker
  start(): void {
    if (this.isRunning) {
      console.log("⚠️ Notification service is already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Starting Simple Notification Service...");

    // Check for notifications every minute
    setInterval(async () => {
      try {
        await this.checkAndSendNotifications();
      } catch (error) {
        console.error("❌ Error in notification checker:", error);
      }
    }, 60 * 1000); // Every 60 seconds

    console.log(
      "✅ Simple Notification Service started (checking every minute)"
    );
  }

  // Main method that checks for notifications to send
  private async checkAndSendNotifications(): Promise<void> {
    const now = new Date();

    // Round down to the current minute (ignore seconds)
    const currentMinute = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      0,
      0
    );

    console.log(
      `🔍 Checking for notifications at ${currentMinute.toISOString()}`
    );

    try {
      // Find all notifications that should be sent this minute
      const notificationsToSend = await prisma.eventNotification.findMany({
        where: {
          notificationTime: {
            gte: currentMinute,
            lt: new Date(currentMinute.getTime() + 60 * 1000), // Next minute
          },
          isEnabled: true,
          isSent: false,
        },
        include: {
          event: {
            include: {
              user: {
                include: {
                  settings: true,
                },
              },
              calendar: true,
              category: true,
            },
          },
        },
      });

      console.log(
        `📋 Found ${notificationsToSend.length} notifications to send`
      );

      for (const notification of notificationsToSend) {
        await this.sendNotification(notification);
      }

      // Clean up old sent notifications (older than 7 days)
      if (now.getMinutes() === 0) {
        // Only run cleanup once per hour
        await this.cleanupOldNotifications();
      }
    } catch (error) {
      console.error("❌ Error checking notifications:", error);
    }
  }

  // Send a single notification
  private async sendNotification(notification: any): Promise<void> {
    const { event } = notification;
    const user = event.user;
    const userSettings = user.settings;

    console.log(
      `📧 Sending ${notification.notificationType} notification for event "${event.title}" to ${user.email}`
    );

    try {
      // Check if user has this type of notification enabled
      if (
        notification.notificationType === "email" &&
        userSettings?.emailNotifications === false
      ) {
        console.log(
          `⏭️ Skipping email notification - user has email notifications disabled`
        );
        await this.markNotificationAsSent(notification.id, "skipped");
        return;
      }

      if (
        notification.notificationType === "browser" &&
        userSettings?.browserNotifications === false
      ) {
        console.log(
          `⏭️ Skipping browser notification - user has browser notifications disabled`
        );
        await this.markNotificationAsSent(notification.id, "skipped");
        return;
      }

      // Send the notification based on type
      if (notification.notificationType === "email") {
        await this.sendEmailNotification(
          event,
          user,
          notification.minutesBefore
        );
      } else if (notification.notificationType === "browser") {
        await this.sendBrowserNotification(
          event,
          user,
          notification.minutesBefore
        );
      }

      // Mark as sent
      await this.markNotificationAsSent(notification.id, "sent");

      // Log the notification
      await this.logNotification(
        event.id,
        user.id,
        notification.notificationType,
        notification.minutesBefore,
        "sent"
      );

      console.log(
        `✅ Successfully sent ${notification.notificationType} notification for event "${event.title}"`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send notification for event "${event.title}":`,
        error
      );

      // Mark as failed but don't set isSent to true so it can be retried
      await this.logNotification(
        event.id,
        user.id,
        notification.notificationType,
        notification.minutesBefore,
        "failed"
      );
    }
  }

  // Send email notification
  private async sendEmailNotification(
    event: CalendarEvent,
    user: User,
    minutesBefore: number
  ): Promise<void> {
    const timeUntilEvent = this.formatTimeUntilEvent(event.start);
    const eventDate = event.start.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const eventTime = event.allDay
      ? "All Day"
      : event.start.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

    const emailHTML = this.generateEmailHTML(
      event,
      timeUntilEvent,
      eventDate,
      eventTime
    );

    const result = await resend.emails.send({
      from: "Calendar Reminders <notifications@mailing.roan.dev>",
      to: user.email,
      subject: `Reminder: ${event.title}`,
      html: emailHTML,
    });

    console.log(`📮 Email sent via Resend - ID: ${result.data?.id}`);
  }

  // Send browser notification (placeholder for now)
  private async sendBrowserNotification(
    event: CalendarEvent,
    user: User,
    minutesBefore: number
  ): Promise<void> {
    // For now, just log browser notifications
    // In a real implementation, you would send this via WebSocket or push notification
    console.log(
      `🔔 Browser notification would be sent to ${user.email} for event "${event.title}"`
    );
  }

  // Mark notification as sent
  private async markNotificationAsSent(
    notificationId: string,
    status: string
  ): Promise<void> {
    await prisma.eventNotification.update({
      where: { id: notificationId },
      data: {
        isSent: status === "sent",
        updatedAt: new Date(),
      },
    });
  }

  // Log notification to database
  private async logNotification(
    eventId: string,
    userId: string,
    notificationType: string,
    minutesBefore: number,
    status: string
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          eventId,
          userId,
          notificationType,
          minutesBefore,
          sentAt: new Date(),
          status,
        },
      });
    } catch (error) {
      console.error("Failed to log notification:", error);
    }
  }

  // Clean up old sent notifications
  private async cleanupOldNotifications(): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const result = await prisma.eventNotification.deleteMany({
        where: {
          isSent: true,
          updatedAt: {
            lt: sevenDaysAgo,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old sent notifications`);
      }
    } catch (error) {
      console.error("Failed to cleanup old notifications:", error);
    }
  }

  // Helper method to create notifications for an event
  async createNotificationsForEvent(
    eventId: string,
    eventStart: Date,
    notifications: Array<{
      notificationType: "email" | "browser";
      minutesBefore: number;
      isEnabled: boolean;
    }>
  ): Promise<void> {
    try {
      const notificationData = notifications.map((notif) => {
        // Calculate the exact notification time
        const notificationTime = new Date(
          eventStart.getTime() - notif.minutesBefore * 60 * 1000
        );

        // Round down to the minute (no seconds)
        const roundedNotificationTime = new Date(
          notificationTime.getFullYear(),
          notificationTime.getMonth(),
          notificationTime.getDate(),
          notificationTime.getHours(),
          notificationTime.getMinutes(),
          0,
          0
        );

        return {
          eventId,
          notificationType: notif.notificationType,
          minutesBefore: notif.minutesBefore,
          notificationTime: roundedNotificationTime,
          isEnabled: notif.isEnabled,
          isSent: false,
        };
      });

      await prisma.eventNotification.createMany({
        data: notificationData,
      });

      console.log(
        `✅ Created ${notificationData.length} notifications for event ${eventId}`
      );
      notificationData.forEach((notif) => {
        console.log(
          `   • ${notif.notificationType} notification ${notif.minutesBefore}min before at ${notif.notificationTime.toISOString()}`
        );
      });
    } catch (error) {
      console.error("Failed to create notifications:", error);
      throw error;
    }
  }

  // Helper method to update notifications for an event
  async updateNotificationsForEvent(
    eventId: string,
    eventStart: Date,
    notifications: Array<{
      notificationType: "email" | "browser";
      minutesBefore: number;
      isEnabled: boolean;
    }>
  ): Promise<void> {
    try {
      // Delete existing notifications for this event
      await prisma.eventNotification.deleteMany({
        where: { eventId },
      });

      // Create new notifications
      if (notifications.length > 0) {
        await this.createNotificationsForEvent(
          eventId,
          eventStart,
          notifications
        );
      }

      console.log(`✅ Updated notifications for event ${eventId}`);
    } catch (error) {
      console.error("Failed to update notifications:", error);
      throw error;
    }
  }

  // Test method to send immediate notification
  async sendTestNotification(userId: string, eventId: string): Promise<void> {
    try {
      const event = await prisma.calendarEvent.findFirst({
        where: { id: eventId, userId },
        include: {
          user: {
            include: { settings: true },
          },
          calendar: true,
          category: true,
        },
      });

      if (!event) {
        throw new Error("Event not found or access denied");
      }

      console.log(`🧪 Sending test notification for event "${event.title}"`);

      // Send test email
      await this.sendEmailNotification(event, event.user, 0);

      // Log the test notification
      await this.logNotification(eventId, userId, "email", 0, "sent");

      console.log(`✅ Test notification sent successfully`);
    } catch (error) {
      console.error("Failed to send test notification:", error);
      throw error;
    }
  }

  // Create a test event with notifications
  async createTestEvent(
    userId: string,
    minutesFromNow: number = 3
  ): Promise<{ eventId: string; message: string }> {
    try {
      // Get user's default calendar
      const defaultCalendar = await prisma.calendar.findFirst({
        where: { userId, isDefault: true },
      });

      if (!defaultCalendar) {
        throw new Error("No default calendar found for user");
      }

      // Create test event
      const eventStart = new Date(Date.now() + minutesFromNow * 60 * 1000);
      const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

      const event = await prisma.calendarEvent.create({
        data: {
          title: `Test Event - ${new Date().toLocaleTimeString()}`,
          description: "This is a test event to verify the notification system",
          start: eventStart,
          end: eventEnd,
          allDay: false,
          userId,
          calendarId: defaultCalendar.id,
        },
      });

      // Create notifications (1 minute and 2 minutes before)
      await this.createNotificationsForEvent(event.id, eventStart, [
        { notificationType: "email", minutesBefore: 1, isEnabled: true },
        { notificationType: "email", minutesBefore: 2, isEnabled: true },
      ]);

      return {
        eventId: event.id,
        message: `Test event created. Event starts at ${eventStart.toLocaleTimeString()} with notifications at 1 and 2 minutes before.`,
      };
    } catch (error) {
      console.error("Failed to create test event:", error);
      throw error;
    }
  }

  // Get notification status
  async getNotificationStatus(): Promise<any> {
    try {
      const now = new Date();
      const currentMinute = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        0,
        0
      );

      // Get pending notifications for the next hour
      const pendingNotifications = await prisma.eventNotification.findMany({
        where: {
          notificationTime: {
            gte: currentMinute,
            lt: new Date(currentMinute.getTime() + 60 * 60 * 1000), // Next hour
          },
          isEnabled: true,
          isSent: false,
        },
        include: {
          event: {
            select: {
              title: true,
              start: true,
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          notificationTime: "asc",
        },
        take: 10,
      });

      // Get recent logs
      const recentLogs = await prisma.notificationLog.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      });

      return {
        isRunning: this.isRunning,
        currentTime: now.toISOString(),
        currentMinute: currentMinute.toISOString(),
        pendingNotifications: pendingNotifications.map((n) => ({
          id: n.id,
          eventTitle: n.event.title,
          userEmail: n.event.user.email,
          type: n.notificationType,
          scheduledFor: n.notificationTime.toISOString(),
          minutesBefore: n.minutesBefore,
        })),
        recentLogs: recentLogs.map((log) => ({
          eventId: log.eventId,
          userId: log.userId,
          type: log.notificationType,
          status: log.status,
          sentAt: log.sentAt.toISOString(),
        })),
      };
    } catch (error) {
      console.error("Failed to get notification status:", error);
      throw error;
    }
  }

  // Generate email HTML
  private generateEmailHTML(
    event: CalendarEvent,
    timeUntilEvent: string,
    eventDate: string,
    eventTime: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Event Reminder</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
            <h1 style="color: #1f2937; margin: 0 0 24px 0; font-size: 24px; font-weight: 600;">📅 Event Reminder</h1>
            
            <div style="background: #f3f4f6; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #3b82f6;">
              <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 20px; font-weight: 600;">${event.title}</h2>
              
              <div style="margin: 12px 0;">
                <strong style="color: #374151;">📅 Date:</strong> 
                <span style="color: #6b7280;">${eventDate}</span>
              </div>
              
              <div style="margin: 12px 0;">
                <strong style="color: #374151;">⏰ Time:</strong> 
                <span style="color: #6b7280;">${eventTime}</span>
              </div>
              
              ${
                event.location
                  ? `
                <div style="margin: 12px 0;">
                  <strong style="color: #374151;">📍 Location:</strong> 
                  <span style="color: #6b7280;">${event.location}</span>
                </div>
              `
                  : ""
              }
              
              ${
                event.description
                  ? `
                <div style="margin: 16px 0 0 0;">
                  <strong style="color: #374151;">📝 Description:</strong>
                  <div style="margin-top: 8px; color: #6b7280; line-height: 1.5;">${event.description}</div>
                </div>
              `
                  : ""
              }
            </div>
            
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 8px; margin: 24px 0;">
              <p style="margin: 0; color: #065f46; font-weight: 500; font-size: 16px;">
                ⏱️ This event is starting <strong>${timeUntilEvent}</strong>
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
            
            <p style="color: #6b7280; font-size: 14px; margin: 0; text-align: center;">
              This reminder was sent because you have notifications enabled for your calendar events.<br>
              You can change your notification preferences in your calendar settings.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  // Format time until event
  private formatTimeUntilEvent(eventStart: Date): string {
    const now = new Date();
    const timeDiff = eventStart.getTime() - now.getTime();
    const minutesUntil = Math.floor(timeDiff / (1000 * 60));
    const hoursUntil = Math.floor(minutesUntil / 60);
    const daysUntil = Math.floor(hoursUntil / 24);

    if (daysUntil > 0) {
      return `in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`;
    } else if (hoursUntil > 0) {
      const remainingMinutes = minutesUntil % 60;
      if (remainingMinutes > 0) {
        return `in ${hoursUntil}h ${remainingMinutes}m`;
      } else {
        return `in ${hoursUntil} hour${hoursUntil > 1 ? "s" : ""}`;
      }
    } else if (minutesUntil > 0) {
      return `in ${minutesUntil} minute${minutesUntil > 1 ? "s" : ""}`;
    } else {
      return "now";
    }
  }
}

// Export singleton instance
export const simpleNotificationService =
  SimpleNotificationService.getInstance();
