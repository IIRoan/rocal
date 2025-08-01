import { prisma } from "./prisma";
import type {
  CalendarEvent,
  User,
  UserSettings,
  EventNotification,
} from "../generated/prisma";

export interface NotificationEvent extends CalendarEvent {
  user: User;
  notifications?: EventNotification[];
}

export interface EmailNotificationData {
  to: string;
  subject: string;
  body: string;
  eventId: string;
  userId: string;
}

// Browser notification interface removed

export class NotificationService {
  private static instance: NotificationService;
  private emailQueue: EmailNotificationData[] = [];
  private isProcessing = false;

  private constructor() {
    // Start processing queue periodically
    setInterval(() => {
      this.processQueues();
    }, 30000); // Process every 30 seconds
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // Check for events that need reminders
  async checkForReminders(): Promise<void> {
    const now = new Date();
    const futureTime = new Date(now.getTime() + 60 * 60 * 1000); // Next hour

    // Find events with custom notifications or legacy reminders in the next hour
    const eventsWithReminders = await prisma.calendarEvent.findMany({
      where: {
        OR: [
          {
            // Legacy reminder field support
            reminder: { not: null },
            start: { gte: now, lte: futureTime },
          },
          {
            // New notification system
            notifications: {
              some: {
                isEnabled: true,
              },
            },
            start: { gte: now },
          },
        ],
      },
      include: {
        user: {
          include: {
            settings: true,
          },
        },
        calendar: true,
        category: true,
        notifications: {
          where: {
            isEnabled: true,
          },
        },
      },
    });

    for (const event of eventsWithReminders) {
      await this.processEventReminder(event as any);
    }
  }

  private async processEventReminder(
    event: NotificationEvent & {
      user: User & { settings?: UserSettings | null };
      calendar: any;
      category: any;
    }
  ): Promise<void> {
    const now = new Date();
    const userSettings = event.user.settings;

    // Process new notification system first
    if (event.notifications && event.notifications.length > 0) {
      for (const notification of event.notifications) {
        await this.processSingleNotification(event, notification, userSettings);
      }
    }
    // Fallback to legacy reminder system for backward compatibility
    else if (event.reminder) {
      const reminderTime = new Date(
        event.start.getTime() - event.reminder * 60 * 1000
      );

      // Check if it's time for the reminder (within 1-minute window)
      if (
        reminderTime <= now &&
        reminderTime > new Date(now.getTime() - 60 * 1000)
      ) {
        // Check if we've already sent this reminder
        const existingNotification = await this.checkIfNotificationSent(
          event.id,
          event.userId,
          "legacy",
          event.reminder
        );
        if (existingNotification) return;

        // Send email notification if enabled
        if (userSettings?.emailNotifications !== false) {
          await this.queueEmailNotification(event, event.reminder);
        }

        // Browser notifications removed

        // Record that notification was sent
        await this.recordNotificationSent(
          event.id,
          event.userId,
          "legacy",
          event.reminder,
          reminderTime
        );
      }
    }
    // If no notifications configured, use user's default reminder setting
    else if (userSettings?.defaultReminder) {
      const reminderTime = new Date(
        event.start.getTime() - userSettings.defaultReminder * 60 * 1000
      );

      if (
        reminderTime <= now &&
        reminderTime > new Date(now.getTime() - 60 * 1000)
      ) {
        const existingNotification = await this.checkIfNotificationSent(
          event.id,
          event.userId,
          "default",
          userSettings.defaultReminder
        );
        if (existingNotification) return;

        if (userSettings?.emailNotifications !== false) {
          await this.queueEmailNotification(
            event,
            userSettings.defaultReminder
          );
        }

        // Browser notifications removed

        await this.recordNotificationSent(
          event.id,
          event.userId,
          "default",
          userSettings.defaultReminder,
          reminderTime
        );
      }
    }
  }

  private async processSingleNotification(
    event: NotificationEvent & {
      user: User & { settings?: UserSettings | null };
      calendar: any;
      category: any;
    },
    notification: EventNotification,
    userSettings: UserSettings | null | undefined
  ): Promise<void> {
    const now = new Date();
    const reminderTime = new Date(
      event.start.getTime() - notification.minutesBefore * 60 * 1000
    );

    // Check if it's time for this specific notification (within 1-minute window)
    if (
      reminderTime <= now &&
      reminderTime > new Date(now.getTime() - 60 * 1000)
    ) {
      // Check if we've already sent this specific notification
      const existingNotification = await this.checkIfNotificationSent(
        event.id,
        event.userId,
        notification.notificationType,
        notification.minutesBefore
      );
      if (existingNotification) return;

      // Send notification based on type and user preferences
      if (
        notification.notificationType === "email" &&
        userSettings?.emailNotifications !== false
      ) {
        await this.queueEmailNotification(event, notification.minutesBefore);
      }
      // Browser notifications removed

      // Record that notification was sent
      await this.recordNotificationSent(
        event.id,
        event.userId,
        notification.notificationType,
        notification.minutesBefore,
        reminderTime
      );
    }
  }

  private async queueEmailNotification(
    event: NotificationEvent & {
      user: User;
      calendar: any;
      category?: any;
    },
    _minutesBefore: number
  ): Promise<void> {
    const timeUntilEvent = this.formatTimeUntilEvent(event.start);

    const emailData: EmailNotificationData = {
      to: event.user.email,
      subject: `Reminder: ${event.title}`,
      body: this.generateEmailBody(event, timeUntilEvent),
      eventId: event.id,
      userId: event.userId,
    };

    this.emailQueue.push(emailData);
  }

  // Browser notification method removed

  private async processQueues(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Process email queue
      while (this.emailQueue.length > 0) {
        const email = this.emailQueue.shift();
        if (email) {
          await this.sendEmail(email);
        }
      }

      // Browser notification queue processing removed
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendEmail(emailData: EmailNotificationData): Promise<void> {
    // In a real implementation, you would integrate with an email service
    // like SendGrid, AWS SES, Nodemailer, etc.
    console.log("Email notification:", {
      to: emailData.to,
      subject: emailData.subject,
      eventId: emailData.eventId,
    });

    // For now, just log - you can implement actual email sending later
    try {
      // Example with Nodemailer (commented out):
      // await this.mailTransporter.sendMail({
      //   from: process.env.FROM_EMAIL,
      //   to: emailData.to,
      //   subject: emailData.subject,
      //   html: emailData.body,
      // });

      console.log(
        `✓ Email reminder sent to ${emailData.to} for event ${emailData.eventId}`
      );
    } catch (error) {
      console.error("Failed to send email notification:", error);
    }
  }

  // Browser notification methods removed

  private generateEmailBody(
    event: NotificationEvent & {
      user: User;
      calendar: any;
      category?: any;
    },
    timeUntilEvent: string
  ): string {
    const eventDate = event.start.toLocaleDateString();
    const eventTime = event.allDay
      ? "All Day"
      : event.start.toLocaleTimeString();

    return `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Event Reminder</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #2563eb;">${event.title}</h3>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
            <p style="margin: 5px 0;"><strong>Time:</strong> ${eventTime}</p>
            ${event.location ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${event.location}</p>` : ""}
            ${event.description ? `<p style="margin: 10px 0;"><strong>Description:</strong><br>${event.description}</p>` : ""}
            <p style="margin: 15px 0 5px 0; color: #666;">
              <em>Starting ${timeUntilEvent}</em>
            </p>
          </div>
          <p style="color: #666; font-size: 12px;">
            This reminder was sent because you have notifications enabled for your calendar events.
            You can change your notification preferences in your calendar settings.
          </p>
        </body>
      </html>
    `;
  }

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

  private async checkIfNotificationSent(
    eventId: string,
    userId: string,
    notificationType: string,
    minutesBefore: number
  ): Promise<boolean> {
    const notification = await prisma.notificationLog.findFirst({
      where: {
        eventId,
        userId,
        notificationType,
        minutesBefore,
        sentAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Within last hour
        },
      },
    });

    return notification !== null;
  }

  private async recordNotificationSent(
    eventId: string,
    userId: string,
    notificationType: string,
    minutesBefore: number,
    sentAt: Date
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          eventId,
          userId,
          notificationType,
          minutesBefore,
          sentAt,
          status: "sent",
        },
      });

      console.log(
        `✓ Recorded ${notificationType} notification sent for event ${eventId}, user ${userId} (${minutesBefore}min before) at ${sentAt.toISOString()}`
      );
    } catch (error) {
      console.error("Failed to record notification:", error);
    }
  }

  // Public method to trigger reminder check (useful for testing or manual triggers)
  async triggerReminderCheck(): Promise<void> {
    await this.checkForReminders();
  }

  // Method to send immediate notification for testing
  async sendTestNotification(userId: string, eventId: string): Promise<void> {
    const event = await prisma.calendarEvent.findFirst({
      where: {
        id: eventId,
        userId: userId,
      },
      include: {
        user: {
          include: {
            settings: true,
          },
        },
        calendar: true,
        category: true,
        notifications: {
          where: {
            isEnabled: true,
          },
        },
      },
    });

    if (event) {
      const userSettings = event.user.settings;

      // Test notifications based on event's notification settings
      if (event.notifications && event.notifications.length > 0) {
        for (const notification of event.notifications) {
          if (
            notification.notificationType === "email" &&
            userSettings?.emailNotifications !== false
          ) {
            await this.queueEmailNotification(
              event as any,
              notification.minutesBefore
            );
          }
          // Browser notifications removed
        }
      } else {
        // Fallback to default 15-minute reminder for testing
        const testMinutes = 15;
        if (userSettings?.emailNotifications !== false) {
          await this.queueEmailNotification(event as any, testMinutes);
        }
        // Browser notifications removed
      }

      await this.processQueues();
    }
  }

  // Helper method to create default notifications for new events
  async createDefaultNotificationsForEvent(
    eventId: string,
    userId: string,
    customReminderMinutes?: number | null
  ): Promise<void> {
    try {
      const userSettings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      const reminderMinutes =
        customReminderMinutes || userSettings?.defaultReminder;

      if (reminderMinutes) {
        // Only create email notifications (browser notifications are no longer used)
        const notifications = [];

        if (userSettings?.emailNotifications !== false) {
          notifications.push({
            eventId,
            notificationType: "email" as const,
            minutesBefore: reminderMinutes,
            isEnabled: true,
          });
        }

        if (notifications.length > 0) {
          await prisma.eventNotification.createMany({
            data: notifications.map((n) => ({
              ...n,
              notificationTime: new Date(
                Date.now() + n.minutesBefore * 60 * 1000
              ),
            })),
          });

          console.log(
            `✓ Created ${notifications.length} default notifications for event ${eventId}`
          );
        }
      }
    } catch (error) {
      console.error("Failed to create default notifications:", error);
    }
  }

  // Helper method to update event notifications
  async updateEventNotifications(
    eventId: string,
    userId: string,
    notifications: Array<{
      notificationType: "browser" | "email";
      minutesBefore: number;
      isEnabled: boolean;
    }>
  ): Promise<void> {
    try {
      // Verify the event belongs to the user
      const event = await prisma.calendarEvent.findFirst({
        where: { id: eventId, userId },
      });

      if (!event) {
        throw new Error("Event not found or access denied");
      }

      // Delete existing notifications for this event
      await prisma.eventNotification.deleteMany({
        where: { eventId },
      });

      // Create new notifications
      if (notifications.length > 0) {
        await prisma.eventNotification.createMany({
          data: notifications.map((n) => ({
            eventId,
            notificationType: n.notificationType,
            minutesBefore: n.minutesBefore,
            isEnabled: n.isEnabled,
            notificationTime: new Date(
              event.start.getTime() - n.minutesBefore * 60 * 1000
            ),
          })),
        });
      }

      console.log(
        `✓ Updated ${notifications.length} notifications for event ${eventId}`
      );
    } catch (error) {
      console.error("Failed to update event notifications:", error);
      throw error;
    }
  }
}

// Initialize the notification service
export const notificationService = NotificationService.getInstance();

// NOTE: Reminder checking is now handled by simple-notification-service.ts
// This service is kept for backward compatibility and CRUD operations only
