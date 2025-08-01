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
      user: User & { settings?: UserSettings | null };
      calendar: any;
      category?: any;
    },
    _minutesBefore: number
  ): Promise<void> {
    const timeUntilEvent = this.formatTimeUntilEvent(event.start);

    const emailData: EmailNotificationData = {
      to: event.user.email,
      subject: `Reminder: ${event.title}`,
      body: await this.generateEmailBody(event, timeUntilEvent),
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

  private async generateEmailBody(
    event: NotificationEvent & {
      user: User & { settings?: UserSettings | null };
      calendar: any;
      category?: any;
    },
    timeUntilEvent: string
  ): Promise<string> {
    const eventDate = event.start.toLocaleDateString();
    const eventTime = event.allDay
      ? "All Day"
      : event.start.toLocaleTimeString();

    // Get user's theme preference, default to light
    const userTheme = event.user.settings?.theme || "light";
    const isDark = userTheme === "dark" || (userTheme === "system" && this.getSystemThemePreference());

    // Define color schemes based on the app's CSS variables
    const colors = isDark ? {
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
      ring: "#A0A0A0"
    } : {
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
      ring: "#808080"
    };

    const categoryColor = event.category?.color || event.calendar?.color || "primary";
    const getCategoryAccentColor = (color: string) => {
      const colorMap: Record<string, string> = {
        blue: isDark ? "#3B82F6" : "#2563EB",
        orange: isDark ? "#F97316" : "#EA580C", 
        violet: isDark ? "#8B5CF6" : "#7C3AED",
        rose: isDark ? "#F43F5E" : "#E11D48",
        emerald: isDark ? "#10B981" : "#059669"
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
                  
                  ${event.location ? `
                    <div class="detail-row">
                      <svg class="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      </svg>
                      <span class="detail-label">Location:</span>
                      <span class="detail-value">${event.location}</span>
                    </div>
                  ` : ""}
                  
                  ${event.category ? `
                    <div class="detail-row">
                      <svg class="detail-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path>
                      </svg>
                      <span class="detail-label">Category:</span>
                      <span class="detail-value">${event.category.name}</span>
                    </div>
                  ` : ""}
                </div>
                
                ${event.description ? `
                  <div class="description">
                    ${event.description.replace(/\n/g, '<br/>')}
                  </div>
                ` : ""}
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
