import { prisma } from "./prisma";
import { redisPubClient, redisSubClient, connectRedis } from "./redis";
import { Resend } from "resend";
import type {
  CalendarEvent,
  User,
  UserSettings,
  EventNotification,
} from "../generated/prisma";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable is required");
}

const resend = new Resend(process.env.RESEND_API_KEY);

export interface NotificationEvent extends CalendarEvent {
  user: User;
  notifications?: EventNotification[];
}

export interface BrowserNotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag: string;
  data: {
    eventId: string;
    userId: string;
    type: "reminder";
  };
}

export interface EmailNotificationData {
  to: string;
  subject: string;
  html: string;
  eventId: string;
  userId: string;
  minutesBefore: number;
}

export class RedisNotificationService {
  private static instance: RedisNotificationService;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): RedisNotificationService {
    if (!RedisNotificationService.instance) {
      RedisNotificationService.instance = new RedisNotificationService();
    }
    return RedisNotificationService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await connectRedis();
      this.isInitialized = true;
      console.log("✓ Redis Notification Service initialized");

      // Start the reminder checking process
      this.startReminderChecker();
    } catch (error) {
      console.error("Failed to initialize Redis Notification Service:", error);
      throw error;
    }
  }

  private startReminderChecker(): void {
    // Check for reminders every 1 minute
    setInterval(async () => {
      try {
        await this.checkForReminders();
      } catch (error) {
        console.error("Error in reminder checker:", error);
      }
    }, 60 * 1000); // Every 60 seconds

    console.log("✓ Reminder checker started (60s intervals)");
  }

  // Check for events that need reminders
  async checkForReminders(): Promise<void> {
    const now = new Date();
    const futureTime = new Date(now.getTime() + 60 * 60 * 1000); // Next hour for legacy reminders
    const extendedFutureTime = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    ); // Next 7 days for new notification system

    console.log(`🔍 Checking for reminders at ${now.toISOString()}`);

    // Find events with custom notifications or legacy reminders
    const eventsWithReminders = await prisma.calendarEvent.findMany({
      where: {
        OR: [
          {
            // Legacy reminder field support (only check next hour for backward compatibility)
            reminder: { not: null },
            start: { gte: now, lte: futureTime },
          },
          {
            // New notification system (check next 7 days to handle long-term reminders)
            notifications: {
              some: {
                isEnabled: true,
              },
            },
            start: { gte: now, lte: extendedFutureTime },
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

    console.log(
      `📋 Found ${eventsWithReminders.length} events with potential reminders`
    );

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

      // Check if it's time for the reminder (within 2-minute window for reliability)
      if (
        reminderTime <= now &&
        reminderTime > new Date(now.getTime() - 2 * 60 * 1000)
      ) {
        // Check if we've already sent this reminder
        const existingNotification = await this.checkIfNotificationSent(
          event.id,
          event.userId,
          "legacy",
          event.reminder
        );
        if (existingNotification) return;

        // Browser notifications disabled - using email only
        // if (userSettings?.browserNotifications !== false) {
        //   await this.sendBrowserNotification(event, event.reminder);
        // }

        // Send email notification if enabled
        if (userSettings?.emailNotifications !== false) {
          await this.sendEmailNotification(event, event.reminder);
        }

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
        reminderTime > new Date(now.getTime() - 2 * 60 * 1000)
      ) {
        const existingNotification = await this.checkIfNotificationSent(
          event.id,
          event.userId,
          "default",
          userSettings.defaultReminder
        );
        if (existingNotification) return;

        // Browser notifications disabled - using email only
        // if (userSettings?.browserNotifications !== false) {
        //   await this.sendBrowserNotification(event, userSettings.defaultReminder);
        // }

        // Send email notification if enabled
        if (userSettings?.emailNotifications !== false) {
          await this.sendEmailNotification(event, userSettings.defaultReminder);
        }

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

    // Check if it's time for this specific notification (within 2-minute window)
    if (
      reminderTime <= now &&
      reminderTime > new Date(now.getTime() - 2 * 60 * 1000)
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
        await this.sendEmailNotification(event, notification.minutesBefore);
      } else if (notification.notificationType === "browser") {
        // Browser notifications disabled - skip
        console.log(
          `⏭️ Skipping browser notification for event ${event.id} (browser notifications disabled)`
        );
        return;
      }

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


  private async sendEmailNotification(
    event: NotificationEvent,
    minutesBefore: number
  ): Promise<void> {
    console.log(`📧 Preparing email notification for event "${event.title}"`);

    try {
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

      const emailData: EmailNotificationData = {
        to: event.user.email,
        subject: `Reminder: ${event.title}`,
        html: this.generateEmailHTML(
          event,
          timeUntilEvent,
          eventDate,
          eventTime
        ),
        eventId: event.id,
        userId: event.userId,
        minutesBefore,
      };

      console.log(`📬 Email data prepared for ${emailData.to}`);

      // Queue email in Redis for processing
      const { redisClient } = await import("./redis");
      const emailQueueKey = "email_queue";

      console.log(`📤 Queueing email in Redis...`);
      await redisClient.lPush(emailQueueKey, JSON.stringify(emailData));

      console.log(
        `✅ Email notification queued for ${event.user.email} - event "${event.title}"`
      );
      console.log(`   └─ ${minutesBefore} minutes before event`);

      // Process the email immediately (we could also use a separate worker)
      console.log(`🔄 Processing email queue...`);
      await this.processEmailQueue();
    } catch (error) {
      console.error("❌ Failed to queue email notification:", error);
      throw error;
    }
  }

  private generateEmailHTML(
    event: NotificationEvent,
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

  private async processEmailQueue(): Promise<void> {
    console.log(`📦 Processing email queue...`);

    try {
      const { redisClient } = await import("./redis");
      const emailQueueKey = "email_queue";

      // Check queue length first
      const queueLength = await redisClient.lLen(emailQueueKey);
      console.log(`📊 Email queue length: ${queueLength}`);

      // Process up to 10 emails at a time
      let processed = 0;
      for (let i = 0; i < 10; i++) {
        const emailDataString = await redisClient.rPop(emailQueueKey);
        if (!emailDataString) break;

        try {
          console.log(`📨 Processing email ${i + 1}...`);
          const emailData: EmailNotificationData = JSON.parse(emailDataString);
          await this.sendEmailViaResend(emailData);
          processed++;
        } catch (error) {
          console.error(`❌ Failed to process queued email ${i + 1}:`, error);
        }
      }

      console.log(`✅ Processed ${processed} emails from queue`);
    } catch (error) {
      console.error("❌ Failed to process email queue:", error);
      throw error;
    }
  }

  private async sendEmailViaResend(
    emailData: EmailNotificationData
  ): Promise<void> {
    console.log(`📮 Sending email via Resend to ${emailData.to}...`);
    console.log(`   └─ Subject: ${emailData.subject}`);

    try {
      const result = await resend.emails.send({
        from: "Calendar Reminders <notifications@mailing.roan.dev>",
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
      });

      console.log(
        `✅ Email sent via Resend to ${emailData.to} for event ${emailData.eventId}`
      );
      console.log(`   └─ Resend ID: ${result.data?.id}`);
      console.log(`   └─ Result:`, result);
    } catch (error) {
      console.error(
        `❌ Failed to send email via Resend to ${emailData.to}:`,
        error
      );
      console.error(`   └─ Error details:`, {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        error: error,
      });

      // Re-queue the email for retry (simple retry mechanism)
      try {
        const { redisClient } = await import("./redis");
        const retryQueueKey = "email_retry_queue";
        await redisClient.lPush(
          retryQueueKey,
          JSON.stringify({
            ...emailData,
            retryCount: (emailData as any).retryCount
              ? (emailData as any).retryCount + 1
              : 1,
            lastAttempt: Date.now(),
          })
        );
        console.log(`🔄 Email re-queued for retry`);
      } catch (retryError) {
        console.error(`❌ Failed to re-queue email for retry:`, retryError);
      }

      throw error; // Re-throw so the caller knows it failed
    }
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
        `✅ Recorded ${notificationType} notification sent for event ${eventId}, user ${userId} (${minutesBefore}min before)`
      );
    } catch (error) {
      console.error("Failed to record notification:", error);
    }
  }

  // Public method to trigger reminder check (useful for testing or manual triggers)
  async triggerReminderCheck(): Promise<void> {
    await this.checkForReminders();
  }

  // Method to send immediate test notification
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
            await this.sendEmailNotification(
              event as any,
              notification.minutesBefore
            );
          } else if (notification.notificationType === "browser") {
            console.log(
              `⏭️ Skipping browser notification for test (browser notifications disabled)`
            );
          }
        }
      } else {
        // Fallback to default 15-minute email reminder for testing
        const testMinutes = 15;
        if (userSettings?.emailNotifications !== false) {
          await this.sendEmailNotification(event as any, testMinutes);
        }
      }
    }
  }

  // Subscribe to notifications for a specific user (for WebSocket/SSE implementation)
  async subscribeToUserNotifications(
    userId: string,
    callback: (notification: BrowserNotificationData) => void
  ): Promise<void> {
    const channel = `notifications:${userId}`;

    await redisSubClient.subscribe(channel, (message) => {
      try {
        const notification: BrowserNotificationData = JSON.parse(message);
        callback(notification);
      } catch (error) {
        console.error("Failed to parse notification message:", error);
      }
    });

    console.log(`📡 Subscribed to notifications for user ${userId}`);
  }

  // Unsubscribe from user notifications
  async unsubscribeFromUserNotifications(userId: string): Promise<void> {
    const channel = `notifications:${userId}`;
    await redisSubClient.unsubscribe(channel);
    console.log(`📴 Unsubscribed from notifications for user ${userId}`);
  }

  // Helper method to create multiple email notifications for an event
  async createMultipleNotificationsForEvent(
    eventId: string,
    userId: string,
    notificationTimes: number[] // Array of minutes before event (e.g., [5, 60, 1440] for 5min, 1hr, 1day)
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

      // Create email notifications for each time specified
      const notifications = notificationTimes.map((minutesBefore) => ({
        eventId,
        notificationType: "email" as const,
        minutesBefore,
        isEnabled: true,
      }));

      if (notifications.length > 0) {
        await prisma.eventNotification.createMany({
          data: notifications,
        });
      }

      console.log(
        `✅ Created ${notifications.length} email notifications for event ${eventId}`
      );
      console.log(
        `   └─ Notification times: ${notificationTimes.map((m) => this.formatMinutesToReadable(m)).join(", ")}`
      );
    } catch (error) {
      console.error("Failed to create multiple notifications:", error);
      throw error;
    }
  }

  private formatMinutesToReadable(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}min`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0
        ? `${hours}h ${remainingMinutes}min`
        : `${hours}h`;
    } else {
      const days = Math.floor(minutes / 1440);
      const remainingHours = Math.floor((minutes % 1440) / 60);
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
  }

  // Method to send immediate test email notification
  async sendTestEmailNotification(
    userId: string,
    eventId: string
  ): Promise<void> {
    console.log(`🧪 Starting test email for user ${userId}, event ${eventId}`);

    try {
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

      if (!event) {
        throw new Error(
          `Event not found or access denied. EventId: ${eventId}, UserId: ${userId}`
        );
      }

      console.log(
        `📋 Found event: "${event.title}" for user: ${event.user.email}`
      );

      const userSettings = event.user.settings;

      if (userSettings?.emailNotifications === false) {
        throw new Error("Email notifications are disabled for this user");
      }

      console.log(
        `⚙️ User settings: emailNotifications=${userSettings?.emailNotifications === true || userSettings?.emailNotifications === undefined}`
      );

      // Send immediate test email
      await this.sendEmailNotification(event as any, 0); // 0 minutes = immediate test
      console.log(
        `✅ Test email sent for event "${event.title}" to ${event.user.email}`
      );
    } catch (error) {
      console.error(`❌ Test email failed:`, error);
      throw error;
    }
  }

  // Method to get pending email notifications from Redis queue
  async getPendingEmailNotifications(
    userId: string
  ): Promise<EmailNotificationData[]> {
    try {
      const { redisClient } = await import("./redis");
      const emailQueueKey = "email_queue";

      // Get all emails in the queue (without removing them)
      const emailStrings = await redisClient.lRange(emailQueueKey, 0, -1);

      const allEmails = emailStrings
        .map((str) => {
          try {
            return JSON.parse(str) as EmailNotificationData;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as EmailNotificationData[];

      // Filter emails for the specific user and remove sensitive HTML content
      const userEmails = allEmails
        .filter((email) => email.userId === userId)
        .map(
          (email) =>
            ({
              ...email,
              html: undefined, // Don't send HTML content in the response
            }) as any
        );

      return userEmails;
    } catch (error) {
      console.error("Failed to get pending email notifications:", error);
      return [];
    }
  }
}

// Initialize the notification service
export const redisNotificationService = RedisNotificationService.getInstance();
