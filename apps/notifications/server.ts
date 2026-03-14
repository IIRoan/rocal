/**
 * Standalone Notification Server
 *
 * Processes scheduled notifications independently from the main backend.
 * Checks the database for notifications that need sending and sends them using Resend API.
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

// Lazy-loaded dependencies to reduce memory footprint
let renderEmail: typeof import("@react-email/render").render | null = null;
let EventReminderEmail: any = null;
let Resend: any = null;

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  console.warn("⚠️ Could not load .env file:", envResult.error.message);
} else {
  console.log("✅ Environment variables loaded from .env");
}

console.log("🔧 Environment check:");
console.log(
  "- DATABASE_URL:",
  process.env.DATABASE_URL ? "✅ Set" : "❌ Missing",
);
console.log(
  "- RESEND_API_KEY:",
  process.env.RESEND_API_KEY ? "✅ Set" : "❌ Missing",
);

// Initialize Prisma client with optimized settings for low memory usage
const prisma = new PrismaClient({
  log: ["error"], // Only log errors to reduce overhead
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Types from the original service
interface NotificationStatus {
  isRunning: boolean;
  pendingNotifications: number;
  lastProcessedAt?: Date;
  processedCount: number;
  failedCount: number;
  errors: NotificationError[];
  retryQueueSize: number;
  nextRetryAt?: Date;
}

interface NotificationError {
  notificationId: string;
  eventId: string;
  userId: string;
  error: string;
  timestamp: Date;
  retryCount?: number;
  nextRetryAt?: Date;
}

interface NotificationRetryInfo {
  notificationId: string;
  eventId: string;
  userId: string;
  retryCount: number;
  nextRetryAt: Date;
  lastError: string;
  originalNotificationTime: Date;
}

interface NotificationDeliveryResult {
  success: boolean;
  error?: string;
  shouldRetry: boolean;
  retryAfterMinutes?: number;
}

class NotificationServer {
  private isRunning = false;
  private backgroundTimer?: NodeJS.Timeout;
  private alignmentTimer?: NodeJS.Timeout;
  private processedCount = 0;
  private failedCount = 0;
  private errors: NotificationError[] = [];
  private lastProcessedAt?: Date;
  private resend: any = null;
  private retryQueue: Map<string, NotificationRetryInfo> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly MAX_ERRORS = 50; // Cap errors array size

  constructor() {
    // Don't initialize heavy dependencies yet - lazy load on first use
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "⚠️ RESEND_API_KEY not found - email notifications will be disabled",
      );
    }

    // Graceful shutdown handlers
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());
    process.on("beforeExit", () => this.shutdown());
  }

  /**
   * Start the notification server
   */
  public start(): void {
    if (this.isRunning) {
      console.log("Notification server is already running");
      return;
    }

    try {
      this.isRunning = true;
      this.processedCount = 0;
      this.failedCount = 0;
      this.errors = [];
      this.retryQueue.clear();

      console.log("🚀 Starting notification server...");

      // Perform initial health check
      this.performInitialHealthCheck().catch((error) => {
        console.warn("⚠️ Initial database health check failed:", error);
      });

      // Clean up stale notifications on startup
      this.cleanupOldNotifications().catch((error) => {
        console.warn("⚠️ Initial cleanup failed:", error);
      });

      // Schedule automatic cleanup
      this.scheduleAutomaticCleanup();

      // Calculate delay to next minute boundary
      const now = new Date();
      const secondsUntilNextMinute = 60 - now.getSeconds();
      const msUntilNextMinute =
        secondsUntilNextMinute * 1000 - now.getMilliseconds();

      console.log(
        `⏰ Aligning notification timer to minute boundary. Current time: ${now.toISOString()}, delay: ${msUntilNextMinute}ms`,
      );

      // Run immediately if we're at the start of a minute
      if (msUntilNextMinute < 1000) {
        console.log(
          "🚀 Running notification check immediately (already at minute boundary)",
        );
        this.processScheduledNotifications().catch((error) => {
          console.error("❌ Initial notification processing failed:", error);
          this.failedCount++;
        });
      }

      // Set up timer to run at the start of each minute
      this.alignmentTimer = setTimeout(() => {
        console.log(
          "🎯 Timer aligned! Starting minute-boundary notification checks",
        );

        // Run the first aligned execution
        this.processScheduledNotifications().catch((error) => {
          console.error("❌ Background notification processing failed:", error);
          this.failedCount++;
          this.errors.push({
            notificationId: "system",
            eventId: "system",
            userId: "system",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date(),
            retryCount: 0,
          });
        });

        // Set up recurring timer for every minute
        this.backgroundTimer = setInterval(async () => {
          try {
            await this.processScheduledNotifications();
            await this.processRetryQueue();
          } catch (error) {
            console.error(
              "❌ Background notification processing failed:",
              error,
            );
            this.failedCount++;
            this.errors.push({
              notificationId: "system",
              eventId: "system",
              userId: "system",
              error: error instanceof Error ? error.message : "Unknown error",
              timestamp: new Date(),
              retryCount: 0,
            });
          }
        }, 60000); // Run every minute
      }, msUntilNextMinute);

      // Schedule automatic cleanup every 24 hours
      this.scheduleAutomaticCleanup();

      console.log("✅ Notification server started successfully");
      this.logServiceStartup();
    } catch (error) {
      console.error("❌ Failed to start notification server:", error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the notification server
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log("Notification server is not running");
      return;
    }

    try {
      this.isRunning = false;

      if (this.backgroundTimer) {
        clearInterval(this.backgroundTimer);
        this.backgroundTimer = undefined;
      }

      if (this.alignmentTimer) {
        clearTimeout(this.alignmentTimer);
        this.alignmentTimer = undefined;
      }

      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      console.log("✅ Notification server stopped successfully");
      console.log(
        `📊 Final statistics: Processed=${this.processedCount}, Failed=${this.failedCount}, RetryQueue=${this.retryQueue.size}`,
      );

      if (this.retryQueue.size > 0) {
        console.warn(
          `⚠️ ${this.retryQueue.size} notifications remain in retry queue`,
        );
      }
    } catch (error) {
      console.error("❌ Error stopping notification server:", error);
      this.isRunning = false;
    }
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    console.log("🛑 Shutting down notification server...");
    this.stop();

    // Disconnect from database
    try {
      await prisma.$disconnect();
      console.log("📦 Database connection closed");
    } catch (error) {
      console.error("❌ Error closing database connection:", error);
    }

    console.log("✅ Notification server stopped gracefully");
    process.exit(0);
  }

  /**
   * Process scheduled notifications
   */
  public async processScheduledNotifications(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

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

    try {
      // Query for notifications that should be sent
      const notificationsToSend = await this.executeWithDatabaseRetry(
        async () => {
          return await prisma.eventNotification.findMany({
            where: {
              notificationTime: {
                lte: currentMinute,
              },
              isEnabled: true,
              isSent: false,
              event: {
                start: {
                  gte: now, // Only include notifications for future events
                },
              },
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
            orderBy: {
              notificationTime: "asc",
            },
          });
        },
      );

      if (notificationsToSend.length > 0) {
        console.log(
          `🔍 Processing ${notificationsToSend.length} scheduled notifications for ${currentMinute.toISOString()}`,
        );
      }

      let processedThisRun = 0;
      let failedThisRun = 0;
      let skippedThisRun = 0;

      // Process each notification
      for (const notification of notificationsToSend) {
        try {
          // Check if event is still valid (not moved to past)
          if (notification.event.start < now) {
            await this.handleEventMovedToPast(
              notification.eventId,
              notification.event.start,
            );
            skippedThisRun++;
            continue;
          }

          const result = await this.sendNotificationWithRetry(notification);
          if (result.success) {
            processedThisRun++;
            this.processedCount++;
            this.retryQueue.delete(notification.id);
          } else {
            failedThisRun++;
            this.failedCount++;
            await this.handleNotificationFailure(notification, result);
          }
        } catch (error) {
          console.error(
            `❌ Error processing notification ${notification.id}:`,
            error,
          );
          failedThisRun++;
          this.failedCount++;
        }
      }

      if (processedThisRun > 0 || failedThisRun > 0 || skippedThisRun > 0) {
        this.lastProcessedAt = new Date();
        await this.logProcessingMetrics(
          processedThisRun,
          failedThisRun,
          skippedThisRun,
        );
      }
    } catch (error) {
      console.error("❌ Error in processScheduledNotifications:", error);
      this.failedCount++;
    }
  }

  /**
   * Send notification with retry logic
   */
  private async sendNotificationWithRetry(
    notification: any,
  ): Promise<NotificationDeliveryResult> {
    try {
      await this.sendNotification(notification);
      return { success: true, shouldRetry: false };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const shouldRetry = this.shouldRetryError(error);
      const retryAfterMinutes = this.calculateRetryDelay(error);

      return {
        success: false,
        error: errorMessage,
        shouldRetry,
        retryAfterMinutes,
      };
    }
  }

  /**
   * Send notification (email or browser)
   */
  private async sendNotification(notification: any): Promise<void> {
    const { event, notificationType, minutesBefore } = notification;
    const user = event.user;

    // Check user notification preferences
    const userSettings = user.settings;
    if (
      notificationType === "email" &&
      userSettings?.emailNotifications === false
    ) {
      console.log(`⏭️ Email notifications disabled for user ${user.email}`);
      await this.markNotificationAsSent(notification.id, "skipped");
      return;
    }

    if (
      notificationType === "browser" &&
      userSettings?.browserNotifications === false
    ) {
      console.log(`⏭️ Browser notifications disabled for user ${user.email}`);
      await this.markNotificationAsSent(notification.id, "skipped");
      return;
    }

    try {
      if (notificationType === "email") {
        await this.sendEmailNotification(event, user, minutesBefore);
      } else if (notificationType === "browser") {
        await this.sendBrowserNotification(event, user, minutesBefore);
      }

      await this.markNotificationAsSent(notification.id, "sent");
      await this.logNotification(
        event.id,
        user.id,
        notificationType,
        minutesBefore,
        "sent",
      );

      console.log(
        `✅ Sent ${notificationType} notification for event "${event.title}" to ${user.email}`,
      );
    } catch (error) {
      console.error(
        `❌ Failed to send ${notificationType} notification for event "${event.title}" to ${user.email}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Send email notification using Resend
   */
  private async sendEmailNotification(
    event: any,
    user: any,
    minutesBefore: number,
  ): Promise<void> {
    // Lazy load Resend client on first email send
    await this.loadResendClient();

    if (!this.resend) {
      throw new Error("Email service not configured - RESEND_API_KEY missing");
    }

    if (!user.email || !this.isValidEmail(user.email)) {
      throw new Error(`Invalid email address: ${user.email}`);
    }

    const userSettings = user.settings;
    if (userSettings?.emailNotifications === false) {
      console.log(`⏭️ Email notifications disabled for user ${user.email}`);
      return;
    }

    try {
      const emailContent = await this.generateEmailContent(
        event,
        user,
        minutesBefore,
      );
      const subject = this.generateEmailSubject(event, minutesBefore);
      const fromAddress = this.getFromAddress();

      const emailData = {
        from: fromAddress,
        to: user.email,
        subject,
        html: emailContent.html,
        text: emailContent.text,
      };

      await this.sendEmailWithRetryLogic(emailData);
    } catch (error) {
      throw this.enhanceEmailError(error, user, event);
    }
  }

  /**
   * Generate email content
   */
  private async generateEmailContent(
    event: any,
    user: any,
    minutesBefore: number,
  ): Promise<{ html: string; text: string }> {
    const userSettings = user.settings;
    const timeFormat = userSettings?.timeFormat || "12h";
    const timezone = userSettings?.timezone || "UTC";

    const formattedDetails = this.formatEventDetailsForEmail(
      event,
      timeFormat,
      timezone,
      minutesBefore,
    );

    // Generate HTML content
    const html = await this.renderEmailTemplate(event, user, formattedDetails);

    // Generate plain text content
    const text = this.generatePlainTextEmail(event, formattedDetails);

    return { html, text };
  }

  /**
   * Lazy load email dependencies
   */
  private async loadEmailDependencies() {
    if (!renderEmail) {
      const { render } = await import("@react-email/render");
      renderEmail = render;
    }
    if (!EventReminderEmail) {
      const module = await import("./emails/templates/event-reminder");
      EventReminderEmail = module.EventReminderEmail;
    }
  }

  /**
   * Lazy load Resend client
   */
  private async loadResendClient() {
    if (!this.resend && process.env.RESEND_API_KEY) {
      if (!Resend) {
        const module = await import("resend");
        Resend = module.Resend;
      }
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  /**
   * Render email template
   */
  private async renderEmailTemplate(
    event: any,
    user: any,
    formattedDetails: any,
  ): Promise<string> {
    await this.loadEmailDependencies();
    const userSettings = user.settings;

    return await renderEmail!(
      EventReminderEmail({
        eventTitle: event.title,
        eventDate:
          formattedDetails.formattedStartTime.split(" at ")[0] ||
          formattedDetails.formattedStartTime,
        eventTime:
          formattedDetails.formattedStartTime.split(" at ")[1] ||
          formattedDetails.formattedStartTime,
        eventLocation: event.location,
        categoryName: event.category?.name,
        categoryColor: event.category?.color || "blue",
        description: event.description,
        timeUntilEvent: formattedDetails.reminderText
          .replace("Your event starts ", "")
          .replace("Your event is starting now!", "now"),
        duration: formattedDetails.duration,
        reminderText: formattedDetails.reminderText,
        userName: user.name || user.email?.split("@")[0],
        userEmail: user.email,
        userTheme: userSettings?.theme || "light",
      }),
    );
  }

  /**
   * Generate plain text email
   */
  private generatePlainTextEmail(event: any, formattedDetails: any): string {
    let text = `Event Reminder: ${event.title}\n\n`;
    text += `${formattedDetails.reminderText}\n\n`;
    text += `Event Details:\n`;
    text += `Start: ${formattedDetails.formattedStartTime}\n`;
    text += `End: ${formattedDetails.formattedEndTime}\n`;

    if (event.description) {
      text += `Description: ${event.description}\n`;
    }

    if (event.location) {
      text += `Location: ${event.location}\n`;
    }

    if (formattedDetails.duration) {
      text += `Duration: ${formattedDetails.duration}\n`;
    }

    return text;
  }

  /**
   * Format event details for email
   */
  private formatEventDetailsForEmail(
    event: any,
    timeFormat: string,
    timezone: string,
    minutesBefore: number,
  ) {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);

    return {
      formattedStartTime: this.formatTimeWithPreference(
        startTime,
        timeFormat,
        timezone,
      ),
      formattedEndTime: this.formatTimeWithPreference(
        endTime,
        timeFormat,
        timezone,
      ),
      reminderText: this.formatReminderText(minutesBefore),
      duration: this.calculateEventDuration(startTime, endTime),
    };
  }

  /**
   * Format time with user preference
   */
  private formatTimeWithPreference(
    date: Date,
    timeFormat: string,
    timezone: string,
  ): string {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: timeFormat === "12h",
      timeZone: timezone,
    };

    return date.toLocaleString("en-US", options);
  }

  /**
   * Calculate event duration
   */
  private calculateEventDuration(start: Date, end: Date): string | undefined {
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    }

    return undefined;
  }

  /**
   * Format reminder text
   */
  private formatReminderText(minutesBefore: number): string {
    if (minutesBefore === 0) {
      return "Your event is starting now!";
    } else if (minutesBefore < 60) {
      return `Your event starts in ${minutesBefore} minute${minutesBefore !== 1 ? "s" : ""}`;
    } else {
      const hours = Math.floor(minutesBefore / 60);
      const remainingMinutes = minutesBefore % 60;

      if (remainingMinutes === 0) {
        return `Your event starts in ${hours} hour${hours !== 1 ? "s" : ""}`;
      } else {
        return `Your event starts in ${hours}h ${remainingMinutes}m`;
      }
    }
  }

  /**
   * Generate email subject
   */
  private generateEmailSubject(event: any, minutesBefore: number): string {
    if (minutesBefore === 0) {
      return `Starting Now: ${event.title}`;
    } else {
      return `Reminder: ${event.title} in ${this.formatReminderText(minutesBefore).replace("Your event starts in ", "")}`;
    }
  }

  /**
   * Send email with retry logic
   */
  private async sendEmailWithRetryLogic(emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }) {
    if (!this.resend) {
      throw new Error("Resend client not initialized");
    }

    try {
      const result = await this.resend.emails.send(emailData);

      if (result.error) {
        const errorMessage =
          result.error.message ||
          result.error.name ||
          JSON.stringify(result.error) ||
          "Unknown Resend API error";
        throw new Error(`Resend API error: ${errorMessage}`);
      }

      console.log(
        `📧 Email sent successfully to ${emailData.to}, ID: ${result.data?.id}`,
      );
      return result;
    } catch (error) {
      console.error(`❌ Failed to send email to ${emailData.to}:`, error);
      throw error;
    }
  }

  /**
   * Send browser notification (placeholder)
   */
  private async sendBrowserNotification(
    event: any,
    user: any,
    minutesBefore: number,
  ): Promise<void> {
    // Browser notifications would typically be handled via WebSocket or push notifications
    // For now, we'll just log it
    console.log(
      `🔔 Browser notification would be sent to ${user.email} for event: ${event.title}`,
    );
  }

  /**
   * Mark notification as sent
   */
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

  /**
   * Log notification
   */
  private async logNotification(
    eventId: string,
    userId: string,
    notificationType: string,
    minutesBefore: number,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          eventId,
          userId,
          notificationType,
          minutesBefore,
          status: errorMessage ? `${status}: ${errorMessage}` : status,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Failed to log notification:", error);
    }
  }

  /**
   * Handle notification failure
   */
  private async handleNotificationFailure(
    notification: any,
    result: NotificationDeliveryResult,
  ): Promise<void> {
    const error: NotificationError = {
      notificationId: notification.id,
      eventId: notification.eventId,
      userId: notification.event.userId,
      error: result.error || "Unknown error",
      timestamp: new Date(),
    };

    // Cap errors array to prevent unbounded memory growth
    this.errors.push(error);
    if (this.errors.length > this.MAX_ERRORS) {
      this.errors.shift();
    }

    if (result.shouldRetry && result.retryAfterMinutes) {
      const retryInfo: NotificationRetryInfo = {
        notificationId: notification.id,
        eventId: notification.eventId,
        userId: notification.event.userId,
        retryCount: 1,
        nextRetryAt: new Date(
          Date.now() + result.retryAfterMinutes * 60 * 1000,
        ),
        lastError: result.error || "Unknown error",
        originalNotificationTime: notification.notificationTime,
      };

      this.retryQueue.set(notification.id, retryInfo);
      console.log(
        `🔄 Scheduled retry for notification ${notification.id} in ${result.retryAfterMinutes} minutes`,
      );
    }

    await this.logNotification(
      notification.eventId,
      notification.event.userId,
      notification.notificationType,
      notification.minutesBefore,
      "failed",
      result.error,
    );
  }

  /**
   * Process retry queue
   */
  private async processRetryQueue(): Promise<void> {
    const now = new Date();
    const retryItems = Array.from(this.retryQueue.values()).filter(
      (item) => item.nextRetryAt <= now,
    );

    for (const retryItem of retryItems) {
      try {
        const notification = await prisma.eventNotification.findUnique({
          where: { id: retryItem.notificationId },
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

        if (!notification || notification.isSent) {
          this.retryQueue.delete(retryItem.notificationId);
          continue;
        }

        const result = await this.sendNotificationWithRetry(notification);
        if (result.success) {
          this.retryQueue.delete(retryItem.notificationId);
          this.processedCount++;
        } else {
          // Update retry info
          retryItem.retryCount++;
          retryItem.lastError = result.error || "Unknown error";

          if (retryItem.retryCount >= 3) {
            // Max retries reached
            this.retryQueue.delete(retryItem.notificationId);
            console.log(
              `❌ Max retries reached for notification ${retryItem.notificationId}`,
            );
          } else if (result.shouldRetry && result.retryAfterMinutes) {
            retryItem.nextRetryAt = new Date(
              Date.now() + result.retryAfterMinutes * 60 * 1000,
            );
          } else {
            this.retryQueue.delete(retryItem.notificationId);
          }
        }
      } catch (error) {
        console.error(
          `❌ Error processing retry for notification ${retryItem.notificationId}:`,
          error,
        );
        this.retryQueue.delete(retryItem.notificationId);
      }
    }
  }

  /**
   * Handle event moved to past
   */
  private async handleEventMovedToPast(
    eventId: string,
    eventStart: Date,
  ): Promise<void> {
    try {
      const result = await prisma.eventNotification.deleteMany({
        where: {
          eventId,
          isSent: false,
          notificationTime: {
            gt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        console.log(
          `🧹 Cleaned up ${result.count} future notifications for past event ${eventId}`,
        );
      }
    } catch (error) {
      console.error(
        `❌ Failed to clean up notifications for past event ${eventId}:`,
        error,
      );
    }
  }

  /**
   * Should retry error
   */
  private shouldRetryError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    // Network/connection errors - retry
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("econnreset") ||
      errorMessage.includes("enotfound")
    ) {
      return true;
    }

    // Rate limiting - retry
    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      return true;
    }

    // Server errors (5xx) - retry
    if (
      errorMessage.includes("500") ||
      errorMessage.includes("502") ||
      errorMessage.includes("503")
    ) {
      return true;
    }

    // Client errors (4xx) - don't retry
    if (
      errorMessage.includes("400") ||
      errorMessage.includes("401") ||
      errorMessage.includes("403") ||
      errorMessage.includes("404")
    ) {
      return false;
    }

    // Default to not retry for unknown errors
    return false;
  }

  /**
   * Calculate retry delay
   */
  private calculateRetryDelay(error: unknown): number {
    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    // Rate limiting - longer delay
    if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
      return 15; // 15 minutes
    }

    // Network errors - shorter delay
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("connection")
    ) {
      return 5; // 5 minutes
    }

    // Default delay
    return 10; // 10 minutes
  }

  /**
   * Execute with database retry
   */
  private async executeWithDatabaseRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries || !this.isRetryableDatabaseError(error)) {
          throw error;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(
          `Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if database error is retryable
   */
  private isRetryableDatabaseError(error: unknown): boolean {
    if (!error) return false;

    const errorMessage =
      error instanceof Error
        ? error.message.toLowerCase()
        : String(error).toLowerCase();

    return (
      errorMessage.includes("connection") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("network") ||
      errorMessage.includes("econnreset") ||
      errorMessage.includes("enotfound")
    );
  }

  /**
   * Perform initial health check
   */
  private async performInitialHealthCheck(): Promise<void> {
    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;
      console.log("✅ Database connection verified");

      // Verify required environment variables
      const requiredEnvVars = ["DATABASE_URL"];
      const missingVars = requiredEnvVars.filter(
        (varName) => !process.env[varName],
      );

      if (missingVars.length > 0) {
        throw new Error(
          `Missing required environment variables: ${missingVars.join(", ")}`,
        );
      }

      // Test email service if configured
      if (this.resend) {
        console.log("✅ Email service configured");
      } else {
        console.log(
          "⚠️ Email service not configured - notifications will be logged only",
        );
      }

      console.log("🎯 Notification server health check passed");
    } catch (error) {
      console.error("❌ Health check failed:", error);
      throw error;
    }
  }

  /**
   * Log service startup
   */
  private async logServiceStartup(): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          eventId: "system",
          userId: "system",
          notificationType: "system",
          minutesBefore: 0,
          status: "service_started: Notification server started successfully",
          sentAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Failed to log service startup:", error);
    }
  }

  /**
   * Log processing metrics
   */
  private async logProcessingMetrics(
    processed: number,
    failed: number,
    skipped: number,
  ): Promise<void> {
    try {
      await prisma.notificationLog.create({
        data: {
          eventId: "system",
          userId: "system",
          notificationType: "system",
          minutesBefore: 0,
          status: `processing_metrics: Processed=${processed}, Failed=${failed}, Skipped=${skipped}`,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Failed to log processing metrics:", error);
    }
  }

  /**
   * Schedule automatic cleanup
   */
  private scheduleAutomaticCleanup(): void {
    // Run cleanup every 24 hours
    this.cleanupTimer = setInterval(
      async () => {
        try {
          await this.cleanupOldNotifications();
        } catch (error) {
          console.error("❌ Automatic cleanup failed:", error);
        }
      },
      24 * 60 * 60 * 1000,
    );

    console.log("🧹 Automatic cleanup scheduled every 24 hours");
  }

  /**
   * Cleanup old notifications
   */
  private async cleanupOldNotifications(
    retentionDays: number = 30,
  ): Promise<void> {
    const retentionCutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );
    const now = new Date();

    try {
      // Delete old notification logs
      const deletedLogs = await prisma.notificationLog.deleteMany({
        where: {
          createdAt: {
            lt: retentionCutoff,
          },
        },
      });

      // Delete old sent notifications
      const deletedSentNotifications =
        await prisma.eventNotification.deleteMany({
          where: {
            isSent: true,
            createdAt: {
              lt: retentionCutoff,
            },
          },
        });

      // Delete stale notifications for past events (events that have already ended)
      const deletedStaleNotifications =
        await prisma.eventNotification.deleteMany({
          where: {
            event: {
              end: {
                lt: now, // Events that have already ended
              },
            },
          },
        });

      console.log(
        `🧹 Cleanup completed: Deleted ${deletedLogs.count} logs, ${deletedSentNotifications.count} old sent notifications, and ${deletedStaleNotifications.count} stale notifications for past events`,
      );
    } catch (error) {
      console.error("❌ Cleanup failed:", error);
    }
  }

  /**
   * Enhance email error
   */
  private enhanceEmailError(error: unknown, user: any, event: any): Error {
    const baseMessage =
      error instanceof Error ? error.message : "Unknown email error";
    return new Error(
      `Email delivery failed for user ${user.email}, event "${event.title}": ${baseMessage}`,
    );
  }

  /**
   * Validate email address
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Get from address
   */
  private getFromAddress(): string {
    return process.env.EMAIL_FROM_ADDRESS || "notifications@mailing.roan.dev";
  }

  /**
   * Get notification status
   */
  public getStatus(): NotificationStatus {
    return {
      isRunning: this.isRunning,
      pendingNotifications: 0, // Would need to query database
      lastProcessedAt: this.lastProcessedAt,
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      errors: this.errors.slice(-10), // Last 10 errors
      retryQueueSize: this.retryQueue.size,
      nextRetryAt: this.getNextRetryTime(),
    };
  }

  /**
   * Health check endpoint
   */
  public async healthCheck(): Promise<{
    status: string;
    timestamp: Date;
    database: boolean;
    emailService: boolean;
    isRunning: boolean;
    uptime?: number;
  }> {
    const startTime = Date.now();
    let databaseHealthy = false;
    let emailServiceHealthy = false;

    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseHealthy = true;
    } catch (error) {
      console.error("Database health check failed:", error);
    }

    emailServiceHealthy = this.resend !== null;

    const status = databaseHealthy && this.isRunning ? "healthy" : "unhealthy";

    return {
      status,
      timestamp: new Date(),
      database: databaseHealthy,
      emailService: emailServiceHealthy,
      isRunning: this.isRunning,
      uptime: Date.now() - startTime,
    };
  }

  /**
   * Get next retry time
   */
  private getNextRetryTime(): Date | undefined {
    if (this.retryQueue.size === 0) return undefined;

    const nextRetryTimes = Array.from(this.retryQueue.values()).map(
      (item) => item.nextRetryAt,
    );
    return new Date(Math.min(...nextRetryTimes.map((date) => date.getTime())));
  }
}

// Create and start the notification server
const notificationServer = new NotificationServer();

console.log("🚀 Starting Notification Server...");
notificationServer.start();

// Create HTTP server for health checks
const PORT = process.env.PORT || 3001;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      try {
        const health = await notificationServer.healthCheck();
        return new Response(JSON.stringify(health), {
          status: health.status === "healthy" ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            status: "unhealthy",
            error: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    if (url.pathname === "/status") {
      const status = notificationServer.getStatus();
      return new Response(JSON.stringify(status), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Notification Server", {
      headers: { "Content-Type": "text/plain" },
    });
  },
});

console.log(`🌐 HTTP server listening on port ${PORT}`);
console.log(`   Health check: http://localhost:${PORT}/health`);
console.log(`   Status: http://localhost:${PORT}/status`);

// Handle graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down gracefully...");
  notificationServer.stop();
  server.stop();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { NotificationServer };
