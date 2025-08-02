import { prisma } from "./prisma";
import { Resend } from "resend";
import type { CalendarEvent, User, UserSettings } from "../generated/prisma";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

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
      "✅ Simple Notification Service started (checking every minute)",
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
      0,
    );

    console.log(
      `🔍 Checking for notifications at ${currentMinute.toISOString()}`,
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
        `📋 Found ${notificationsToSend.length} notifications to send`,
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
      `📧 Sending ${notification.notificationType} notification for event "${event.title}" to ${user.email}`,
    );

    try {
      // Check if user has this type of notification enabled
      if (
        notification.notificationType === "email" &&
        userSettings?.emailNotifications === false
      ) {
        console.log(
          `⏭️ Skipping email notification - user has email notifications disabled`,
        );
        await this.markNotificationAsSent(notification.id, "skipped");
        return;
      }

      if (
        notification.notificationType === "browser" &&
        userSettings?.browserNotifications === false
      ) {
        console.log(
          `⏭️ Skipping browser notification - user has browser notifications disabled`,
        );
        await this.markNotificationAsSent(notification.id, "skipped");
        return;
      }

      // Send the notification based on type
      if (notification.notificationType === "email") {
        await this.sendEmailNotification(
          event,
          user,
          notification.minutesBefore,
        );
      } else if (notification.notificationType === "browser") {
        await this.sendBrowserNotification(
          event,
          user,
          notification.minutesBefore,
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
        "sent",
      );

      console.log(
        `✅ Successfully sent ${notification.notificationType} notification for event "${event.title}"`,
      );
    } catch (error) {
      console.error(
        `❌ Failed to send notification for event "${event.title}":`,
        error,
      );

      // Mark as failed but don't set isSent to true so it can be retried
      await this.logNotification(
        event.id,
        user.id,
        notification.notificationType,
        notification.minutesBefore,
        "failed",
      );
    }
  }

  // Send email notification
  private async sendEmailNotification(
    event: CalendarEvent & {
      user: User & { settings?: UserSettings | null };
      calendar?: any;
      category?: any;
    },
    user: User & { settings?: UserSettings | null },
    minutesBefore: number,
  ): Promise<void> {
    if (!resend) {
      console.log(
        `⚠️ Resend not configured - skipping email notification for ${user.email}`,
      );
      return;
    }

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

    const emailHTML = await this.generateEmailHTML(
      { ...event, user },
      timeUntilEvent,
      eventDate,
      eventTime,
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
    minutesBefore: number,
  ): Promise<void> {
    // For now, just log browser notifications
    // In a real implementation, you would send this via WebSocket or push notification
    console.log(
      `🔔 Browser notification would be sent to ${user.email} for event "${event.title}"`,
    );
  }

  // Mark notification as sent
  private async markNotificationAsSent(
    notificationId: string,
    status: string,
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
    status: string,
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
    }>,
  ): Promise<void> {
    try {
      const notificationData = notifications.map((notif) => {
        // Calculate the exact notification time
        const notificationTime = new Date(
          eventStart.getTime() - notif.minutesBefore * 60 * 1000,
        );

        // Round down to the minute (no seconds)
        const roundedNotificationTime = new Date(
          notificationTime.getFullYear(),
          notificationTime.getMonth(),
          notificationTime.getDate(),
          notificationTime.getHours(),
          notificationTime.getMinutes(),
          0,
          0,
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
        `✅ Created ${notificationData.length} notifications for event ${eventId}`,
      );
      notificationData.forEach((notif) => {
        console.log(
          `   • ${notif.notificationType} notification ${notif.minutesBefore}min before at ${notif.notificationTime.toISOString()}`,
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
    }>,
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
          notifications,
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
    minutesFromNow: number = 3,
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
        0,
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
  private async generateEmailHTML(
    event: CalendarEvent & {
      user: User & { settings?: UserSettings | null };
      calendar?: any;
      category?: any;
    },
    timeUntilEvent: string,
    eventDate: string,
    eventTime: string,
  ): Promise<string> {
    // Get user's theme preference, default to light
    const userTheme = event.user.settings?.theme || "light";
    const isDark =
      userTheme === "dark" ||
      (userTheme === "system" && this.getSystemThemePreference());

    // Define color schemes based on the app's CSS variables
    const colors = isDark
      ? {
          // Dark theme colors (converted from OKLCH to hex approximations)
          background: "#2A2A2A",
          foreground: "#F0F0F0",
          card: "#2A2A2A",
          cardForeground: "#F0F0F0",
          primary: "#E0E0E0",
          primaryForeground: "#2A2A2A",
          secondary: "#3A3A3A",
          secondaryForeground: "#F0F0F0",
          muted: "#3A3A3A",
          mutedForeground: "#A0A0A0",
          accent: "#A0A0A0",
          accentForeground: "#1A1A1A",
          border: "#3A3A3A",
          ring: "#A0A0A0",
        }
      : {
          // Light theme colors (converted from OKLCH to hex approximations)
          background: "#FEFEFE",
          foreground: "#1A1A1A",
          card: "#FEFEFE",
          cardForeground: "#1A1A1A",
          primary: "#1A1A1A",
          primaryForeground: "#FAFAFA",
          secondary: "#F0F0F0",
          secondaryForeground: "#1A1A1A",
          muted: "#F0F0F0",
          mutedForeground: "#808080",
          accent: "#808080",
          accentForeground: "#FAFAFA",
          border: "#F0F0F0",
          ring: "#808080",
        };

    const categoryColor =
      event.category?.color || event.calendar?.color || "primary";
    const getCategoryAccentColor = (color: string) => {
      const colorMap: Record<string, string> = {
        blue: isDark ? "#3B82F6" : "#2563EB",
        orange: isDark ? "#F97316" : "#EA580C",
        violet: isDark ? "#8B5CF6" : "#7C3AED",
        rose: isDark ? "#F43F5E" : "#E11D48",
        emerald: isDark ? "#10B981" : "#059669",
      };
      return colorMap[color] || colors.accent;
    };

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Event Reminder - ${event.title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
              line-height: 1.5;
              color: ${colors.foreground};
              background-color: ${colors.background};
            }
            
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: ${colors.background};
            }
            
            .header {
              text-align: center;
              padding: 32px 24px 24px;
              border-bottom: 1px solid ${colors.border};
            }
            
            .logo {
              font-size: 24px;
              font-weight: 600;
              color: ${colors.primary};
              margin-bottom: 8px;
            }
            
            .subtitle {
              color: ${colors.mutedForeground};
              font-size: 14px;
            }
            
            .content {
              padding: 32px 24px;
            }
            
            .event-card {
              background-color: ${colors.card};
              border: 1px solid ${colors.border};
              border-radius: 12px;
              padding: 24px;
              margin-bottom: 24px;
              box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
            }
            
            .event-header {
              display: flex;
              align-items: flex-start;
              gap: 12px;
              margin-bottom: 16px;
            }
            
            .event-indicator {
              width: 4px;
              height: 48px;
              background-color: ${getCategoryAccentColor(categoryColor)};
              border-radius: 2px;
              flex-shrink: 0;
            }
            
            .event-title {
              font-size: 20px;
              font-weight: 600;
              color: ${colors.cardForeground};
              margin-bottom: 4px;
            }
            
            .event-time-badge {
              display: inline-block;
              background-color: ${colors.accent}20;
              color: ${colors.accent};
              padding: 4px 8px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 500;
              text-transform: uppercase;
              letter-spacing: 0.025em;
            }
            
            .event-details {
              margin-top: 16px;
            }
            
            .detail-row {
              display: flex;
              align-items: center;
              gap: 8px;
              margin-bottom: 8px;
              font-size: 14px;
            }
            
            .detail-icon {
              width: 16px;
              height: 16px;
              color: ${colors.mutedForeground};
              flex-shrink: 0;
            }
            
            .detail-label {
              font-weight: 500;
              color: ${colors.cardForeground};
              min-width: 60px;
            }
            
            .detail-value {
              color: ${colors.mutedForeground};
            }
            
            .description {
              background-color: ${colors.muted};
              padding: 12px;
              border-radius: 8px;
              margin-top: 12px;
              font-size: 14px;
              color: ${colors.mutedForeground};
              line-height: 1.4;
            }
            
            .footer {
              padding: 24px;
              border-top: 1px solid ${colors.border};
              text-align: center;
            }
            
            .footer-text {
              font-size: 12px;
              color: ${colors.mutedForeground};
              line-height: 1.4;
            }
            
            .footer-link {
              color: ${colors.accent};
              text-decoration: none;
            }
            
            .footer-link:hover {
              text-decoration: underline;
            }
            
            @media (max-width: 640px) {
              .container {
                margin: 0 16px;
              }
              
              .content, .header, .footer {
                padding-left: 16px;
                padding-right: 16px;
              }
              
              .event-card {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">📅 Rocani</div>
              <div class="subtitle">Event Reminder</div>
            </div>
            
            <div class="content">
              <div class="event-card">
                <div class="event-header">
                  <div class="event-indicator"></div>
                  <div>
                    <h1 class="event-title">${event.title}</h1>
                    <span class="event-time-badge">Starting ${timeUntilEvent}</span>
                  </div>
                </div>
                
                <div class="event-details">
                  <div class="detail-row">
                    <svg class="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${eventDate}</span>
                  </div>
                  
                  <div class="detail-row">
                    <svg class="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span class="detail-label">Time:</span>
                    <span class="detail-value">${eventTime}</span>
                  </div>
                  
                  ${
                    event.location
                      ? `
                    <div class="detail-row">
                      <svg class="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      </svg>
                      <span class="detail-label">Location:</span>
                      <span class="detail-value">${event.location}</span>
                    </div>
                  `
                      : ""
                  }
                  
                  ${
                    event.category
                      ? `
                    <div class="detail-row">
                      <svg class="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                      </svg>
                      <span class="detail-label">Category:</span>
                      <span class="detail-value">${event.category.name}</span>
                    </div>
                  `
                      : ""
                  }
                </div>
                
                ${
                  event.description
                    ? `
                  <div class="description">
                    ${event.description.replace(/\n/g, "<br/>")}
                  </div>
                `
                    : ""
                }
              </div>
            </div>
            
            <div class="footer">
              <p class="footer-text">
                This reminder was sent because you have email notifications enabled.<br/>
                You can manage your notification preferences in your 
                <a href="#" class="footer-link">calendar settings</a>.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getSystemThemePreference(): boolean {
    // This is a server-side approximation - in a real implementation,
    // you might want to store the user's actual system preference
    // or use a more sophisticated detection method
    return false; // Default to light theme if system preference is unknown
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
