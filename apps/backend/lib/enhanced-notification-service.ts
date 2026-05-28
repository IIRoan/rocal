/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Enhanced Notification Service
 *
 * Provides precise, time-based event notifications with lifecycle management.
 * Calculates exact notification times when reminders are created and manages
 * the complete notification lifecycle.
 */

import { prisma } from "./prisma";
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from "./time-constants";
import {
  NotificationCalculator,
  type NotificationConfig,
} from "./notification-calculator";
import type {
  CalendarEvent,
  EventNotification,
  User,
  UserSettings,
  Calendar,
  EventCategory,
} from "../generated/prisma";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { createLogger } from "@workspace/logger";
import { errorMessage } from "./errors";
import {
  isRetryableError,
  isRetryableDatabaseError,
  isRetryableUpdateError,
} from "./error-classification";
// Conditional import to avoid Next.js build issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let EventReminderEmail: ((...args: any[]) => React.JSX.Element) | undefined;
if (!process.env.SKIP_EMAIL_TEMPLATES) {
  EventReminderEmail =
    require("../emails/templates/event-reminder").EventReminderEmail;
}

const logger = createLogger("backend:enhanced-notifications");

type EventWithRelations = CalendarEvent & {
  calendar?: Calendar | null;
  category?: EventCategory | null;
};

type NotificationEventData = EventNotification & {
  event: EventWithRelations & {
    user: User & { settings?: UserSettings | null };
  };
};

interface FormattedEventDetails {
  timeUntilEvent: string;
  eventDate: string;
  eventTime: string;
  duration?: string;
  location?: string;
  categoryName?: string;
  categoryColor: string;
  description?: string;
  reminderText: string;
}

export interface NotificationStatus {
  isRunning: boolean;
  pendingNotifications: number;
  lastProcessedAt?: Date;
  processedCount: number;
  failedCount: number;
  errors: NotificationError[];
  retryQueueSize: number;
  nextRetryAt?: Date;
  cleanup: {
    isScheduled: boolean;
    nextRunEstimate?: Date;
    lastCleanupStats?: {
      timestamp: Date;
      deletedLogs: number;
      deletedNotifications: number;
      duration: number;
    };
  };
}

export interface NotificationError {
  notificationId: string;
  eventId: string;
  userId: string;
  error: string;
  timestamp: Date;
  retryCount?: number;
  nextRetryAt?: Date;
}

export interface NotificationRetryInfo {
  notificationId: string;
  eventId: string;
  userId: string;
  retryCount: number;
  nextRetryAt: Date;
  lastError: string;
  originalNotificationTime: Date;
}

export interface NotificationDeliveryResult {
  success: boolean;
  error?: string;
  shouldRetry: boolean;
  retryAfterMinutes?: number;
}

export interface CreateNotificationResult {
  created: EventNotification[];
  skipped: Array<{
    config: NotificationConfig;
    reason: string;
  }>;
}

export class EnhancedNotificationService {
  private static instance: EnhancedNotificationService;
  private isRunning = false;
  private backgroundTimer?: NodeJS.Timeout;
  private alignmentTimer?: NodeJS.Timeout;
  private processedCount = 0;
  private failedCount = 0;
  private errors: NotificationError[] = [];
  private lastProcessedAt?: Date;
  private resend: Resend | null;
  private retryQueue: Map<string, NotificationRetryInfo> = new Map();
  private updateLocks?: Map<string, { locked: boolean; timestamp: number }>;
  private templateCache?: Map<string, string>;
  private cleanupTimer?: NodeJS.Timeout;
  private lastCleanupStats?: {
    timestamp: Date;
    deletedLogs: number;
    deletedNotifications: number;
    duration: number;
  };

  private constructor() {
    // Private constructor for singleton pattern
    // Initialize Resend if API key is available
    this.resend = process.env.RESEND_API_KEY
      ? new Resend(process.env.RESEND_API_KEY)
      : null;
  }

  public static getInstance(): EnhancedNotificationService {
    if (!EnhancedNotificationService.instance) {
      EnhancedNotificationService.instance = new EnhancedNotificationService();
    }
    return EnhancedNotificationService.instance;
  }

  /**
   * Start the notification service lifecycle with enhanced error handling
   * Initializes background processing timer with comprehensive error handling and recovery
   * @param options - Optional configuration for service startup
   */
  public start(options?: {
    enableAutomaticCleanup?: boolean;
    cleanupIntervalHours?: number;
    cleanupRetentionDays?: number;
    enableDatabaseHealthCheck?: boolean;
  }): void {
    if (this.isRunning) {
      logger.info("Enhanced notification service is already running");
      return;
    }

    try {
      this.isRunning = true;
      this.processedCount = 0;
      this.failedCount = 0;
      this.errors = [];
      this.retryQueue.clear();

      // Perform initial database health check if enabled
      if (options?.enableDatabaseHealthCheck !== false) {
        this.performInitialHealthCheck().catch((error) => {
          logger.warn("⚠️ Initial database health check failed:", error);
          // Don't fail startup, but log the issue
        });
      }

      // Start background timer that runs at the start of each minute
      // First, calculate delay to next minute boundary
      const now = new Date();
      const secondsUntilNextMinute = 60 - now.getSeconds();
      const msUntilNextMinute =
        secondsUntilNextMinute * 1000 - now.getMilliseconds();

      logger.info(
        `⏰ Aligning notification timer to minute boundary. Current time: ${now.toISOString()}, delay: ${msUntilNextMinute}ms`,
      );

      // Run immediately if we're at the start of a minute, otherwise wait
      if (msUntilNextMinute < 1000) {
        // We're very close to the minute boundary, run immediately
        logger.info(
          "🚀 Running notification check immediately (already at minute boundary)",
        );
        this.processScheduledNotifications().catch((error) => {
          logger.error("❌ Initial notification processing failed:", error);
          this.failedCount++;
        });
      }

      // Set up timer to run at the start of each minute
      this.alignmentTimer = setTimeout(() => {
        logger.info(
          "🎯 Timer aligned! Starting minute-boundary notification checks",
        );

        // Run the first aligned execution
        this.processScheduledNotifications().catch((error) => {
          logger.error("❌ Background notification processing failed:", error);
          this.failedCount++;

          // Enhanced system error logging with recovery information
          this.errors.push({
            notificationId: "system",
            eventId: "system",
            userId: "system",
            error: errorMessage(error),
            timestamp: new Date(),
            retryCount: 0,
          });

          // Keep only last 50 errors to prevent memory issues
          if (this.errors.length > 50) {
            this.errors = this.errors.slice(-50);
          }

          // Log critical system errors for monitoring
          this.logCriticalSystemError(error);
        });

        // Then set up regular interval to run every 60 seconds
        this.backgroundTimer = setInterval(() => {
          this.processScheduledNotifications().catch((error) => {
            logger.error(
              "❌ Background notification processing failed:",
              error,
            );
            this.failedCount++;

            // Enhanced system error logging with recovery information
            this.errors.push({
              notificationId: "system",
              eventId: "system",
              userId: "system",
              error: errorMessage(error),
              timestamp: new Date(),
              retryCount: 0,
            });

            // Keep only last 50 errors to prevent memory issues
            if (this.errors.length > 50) {
              this.errors = this.errors.slice(-50);
            }

            // Log critical system errors for monitoring
            this.logCriticalSystemError(error);
          });
        }, 60000); // 60 seconds
      }, msUntilNextMinute);

      // Start automatic cleanup if enabled
      if (options?.enableAutomaticCleanup !== false) {
        // Default to enabled unless explicitly disabled
        this.scheduleAutomaticCleanup(
          options?.cleanupIntervalHours || 24,
          options?.cleanupRetentionDays || 30,
        );
      }

      logger.ok("✅ Enhanced notification service started successfully");
      logger.info(
        `📊 Service status: Running=${this.isRunning}, RetryQueue=${this.retryQueue.size}, AutoCleanup=${!!this.cleanupTimer}`,
      );

      // Log service startup for monitoring
      this.logServiceStartup();
    } catch (error) {
      logger.error("❌ Failed to start enhanced notification service:", error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Perform initial database health check
   */
  private async performInitialHealthCheck(): Promise<void> {
    try {
      logger.info("🔍 Performing initial database health check...");

      // Test basic database connectivity
      await this.executeWithDatabaseRetry(async () => {
        return await prisma.$queryRaw`SELECT 1 as health_check`;
      });

      // Check for pending notifications that might need immediate attention
      const pendingCount = await this.executeWithDatabaseRetry(async () => {
        return await prisma.eventNotification.count({
          where: {
            isEnabled: true,
            isSent: false,
            notificationTime: {
              lte: new Date(), // Overdue notifications
            },
          },
        });
      });

      if (pendingCount > 0) {
        logger.warn(
          `⚠️ Found ${pendingCount} overdue notifications that will be processed`,
        );
      }

      logger.ok("✅ Database health check completed successfully");
    } catch (error) {
      logger.error("❌ Database health check failed:", error);
      throw error;
    }
  }

  /**
   * Log critical system errors for monitoring
   * @param error - The critical error
   */
  private async logCriticalSystemError(error: unknown): Promise<void> {
    try {
      const message = errorMessage(error);

      await this.executeWithDatabaseRetry(async () => {
        return await prisma.notificationLog.create({
          data: {
            eventId: "system",
            userId: "system",
            notificationType: "system",
            minutesBefore: 0,
            status: `critical_error: ${message}`,
            sentAt: new Date(),
          },
        });
      });
    } catch (logError) {
      logger.error("Failed to log critical system error:", logError);
      // Don't throw - we don't want logging failures to crash the service
    }
  }

  /**
   * Log service startup for monitoring
   */
  private async logServiceStartup(): Promise<void> {
    try {
      await this.executeWithDatabaseRetry(async () => {
        return await prisma.notificationLog.create({
          data: {
            eventId: "system",
            userId: "system",
            notificationType: "system",
            minutesBefore: 0,
            status:
              "service_started: Enhanced notification service started successfully",
            sentAt: new Date(),
          },
        });
      });
    } catch (error) {
      logger.error("Failed to log service startup", error);
      // Don't throw - this is just for monitoring
    }
  }

  /**
   * Stop the notification service lifecycle
   * Clears background processing timer, cleanup timer, and logs final statistics
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.info("Enhanced notification service is not running");
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

      // Stop automatic cleanup if running
      this.stopAutomaticCleanup();

      // Log final statistics
      logger.ok("✅ Enhanced notification service stopped successfully");
      logger.info(
        `📊 Final statistics: Processed=${this.processedCount}, Failed=${this.failedCount}, RetryQueue=${this.retryQueue.size}`,
      );

      if (this.retryQueue.size > 0) {
        logger.warn(
          `⚠️ ${this.retryQueue.size} notifications remain in retry queue`,
        );
      }
    } catch (error) {
      logger.error("❌ Error stopping enhanced notification service:", error);
      // Force stop even if there's an error
      this.isRunning = false;
      if (this.backgroundTimer) {
        clearInterval(this.backgroundTimer);
        this.backgroundTimer = undefined;
      }
      if (this.alignmentTimer) {
        clearTimeout(this.alignmentTimer);
        this.alignmentTimer = undefined;
      }
      // Force stop cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }
    }
  }

  /**
   * Create notifications for an event with exact time calculation and enhanced error handling
   * @param eventId - The event ID
   * @param eventStart - The event start time
   * @param notifications - Array of notification configurations
   * @returns Result with created notifications and any skipped ones
   */
  public async createNotificationsForEvent(
    eventId: string,
    eventStart: Date,
    notifications: NotificationConfig[],
  ): Promise<CreateNotificationResult> {
    try {
      // Validate event exists with database retry
      const event = await this.executeWithDatabaseRetry(async () => {
        return await prisma.calendarEvent.findUnique({
          where: { id: eventId },
          select: { id: true, userId: true, start: true, timezone: true },
        });
      });

      if (!event) {
        throw new Error(`Event with ID ${eventId} not found`);
      }

      // Use the provided eventStart or fall back to event.start
      const actualEventStart = eventStart || event.start;

      // Check if event is in the past - don't create notifications
      const now = new Date();
      if (actualEventStart < now) {
        logger.info(
          `⏭️ Event ${eventId} is in the past, skipping notification creation`,
        );
        return {
          created: [],
          skipped: notifications.map((config) => ({
            config,
            reason: "Event is in the past",
          })),
        };
      }

      const created: EventNotification[] = [];
      const skipped: Array<{ config: NotificationConfig; reason: string }> = [];

      // Process each notification configuration with database retry
      for (const config of notifications) {
        try {
          const schedule = NotificationCalculator.buildNotificationSchedule(
            actualEventStart,
            config.minutesBefore,
            event.timezone,
          );

          // Calculate exact notification time
          const result =
            NotificationCalculator.calculateNotificationTimeWithValidation(
              actualEventStart,
              config.minutesBefore,
            );

          if (!result.isValid) {
            skipped.push({
              config,
              reason: result.error || "Invalid notification time",
            });
            continue;
          }

          // Create notification record with database retry
          const notification = await this.executeWithDatabaseRetry(async () => {
            const notificationId = crypto.randomUUID();
            await prisma.$executeRaw`
              INSERT INTO public.event_notification (
                id,
                event_id,
                notification_type,
                minutes_before,
                notification_time,
                notification_date_local,
                notification_timezone,
                is_enabled,
                is_sent,
                created_at,
                updated_at
              ) VALUES (
                ${notificationId},
                ${eventId},
                ${config.notificationType},
                ${config.minutesBefore},
                ${schedule.notificationTime},
                ${schedule.notificationDateLocal},
                ${schedule.notificationTimezone},
                ${config.isEnabled},
                false,
                NOW(),
                NOW()
              )
            `;
            return {
              id: notificationId,
              eventId,
              notificationType: config.notificationType,
              minutesBefore: config.minutesBefore,
              notificationTime: schedule.notificationTime,
              isEnabled: config.isEnabled,
              isSent: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as EventNotification;
          });

          created.push(notification);

          logger.ok(
            `✅ Created ${config.notificationType} notification for event ${eventId}: ` +
              `${config.minutesBefore}min before at ${schedule.notificationDateLocal} ${schedule.notificationTimezone}`,
          );
        } catch (error) {
          const message = errorMessage(error);
          skipped.push({
            config,
            reason: message,
          });

          logger.error(
            `❌ Failed to create notification for event ${eventId}:`,
            errorMessage,
          );
        }
      }

      logger.ok(
        `✅ Created notifications for event ${eventId}: ${created.length} created, ${skipped.length} skipped`,
      );

      return { created, skipped };
    } catch (error) {
      logger.error("❌ Failed to create notifications for event:", error);
      throw error;
    }
  }

  /**
   * Update notifications for an event with proper cleanup and concurrent update handling
   * Replaces all existing notifications with new configuration
   * @param eventId - The event ID
   * @param eventStart - The event start time
   * @param notifications - Array of new notification configurations
   * @returns Result with created notifications and any skipped ones
   */
  public async updateNotificationsForEvent(
    eventId: string,
    eventStart: Date,
    notifications: NotificationConfig[],
  ): Promise<CreateNotificationResult> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    // Implement retry logic for concurrent update handling
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.updateNotificationsForEventWithRetry(
          eventId,
          eventStart,
          notifications,
          attempt,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        // Check if this is a retryable error (database connection, deadlock, etc.)
        if (isRetryableUpdateError(error) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          logger.warn(
            `⚠️ Update attempt ${attempt} failed for event ${eventId}, retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Non-retryable error or max retries reached
        logger.error(
          `❌ Failed to update notifications for event ${eventId} after ${attempt} attempts:`,
          lastError.message,
        );
        throw lastError;
      }
    }

    throw lastError || new Error("Update failed after all retry attempts");
  }

  /**
   * Internal method for updating notifications with database connection handling
   * @param eventId - The event ID
   * @param eventStart - The event start time
   * @param notifications - Array of new notification configurations
   * @param attempt - Current attempt number for logging
   * @returns Result with created notifications and any skipped ones
   */
  private async updateNotificationsForEventWithRetry(
    eventId: string,
    eventStart: Date,
    notifications: NotificationConfig[],
    attempt: number,
  ): Promise<CreateNotificationResult> {
    try {
      // Validate event exists with database connection handling
      const event = await this.executeWithDatabaseRetry(async () => {
        return await prisma.calendarEvent.findUnique({
          where: { id: eventId },
          select: { id: true, userId: true, start: true, timezone: true },
        });
      });

      if (!event) {
        throw new Error(`Event with ID ${eventId} not found`);
      }

      // Check if event was moved to past date - clean up future notifications
      const now = new Date();
      const actualEventStart = eventStart || event.start;

      if (actualEventStart < now) {
        logger.info(
          `🧹 Event ${eventId} moved to past date, cleaning up future notifications`,
        );
        await this.handleEventMovedToPast(eventId, actualEventStart);
        return { created: [], skipped: [] };
      }

      // Use transaction with proper isolation level for concurrent updates
      const result = await this.executeWithDatabaseRetry(async () => {
        return await prisma.$transaction(
          async (tx) => {
            // Use SELECT FOR UPDATE to prevent concurrent modifications
            await tx.$executeRaw`SELECT id FROM calendar_event WHERE id = ${eventId} FOR UPDATE`;

            // Delete all existing notifications for this event
            const deletedCount = await tx.eventNotification.deleteMany({
              where: { eventId },
            });

            logger.info(
              `✓ Deleted ${deletedCount.count} existing notifications for event ${eventId} (attempt ${attempt})`,
            );

            // Create new notifications if any provided
            if (notifications.length === 0) {
              return { created: [], skipped: [] };
            }

            const created: EventNotification[] = [];
            const skipped: Array<{
              config: NotificationConfig;
              reason: string;
            }> = [];

            // Process each notification configuration
            for (const config of notifications) {
              try {
                const schedule =
                  NotificationCalculator.buildNotificationSchedule(
                    actualEventStart,
                    config.minutesBefore,
                    event.timezone,
                  );

                // Calculate exact notification time
                const calcResult =
                  NotificationCalculator.calculateNotificationTimeWithValidation(
                    actualEventStart,
                    config.minutesBefore,
                  );

                if (!calcResult.isValid) {
                  skipped.push({
                    config,
                    reason: calcResult.error || "Invalid notification time",
                  });
                  continue;
                }

                // Create notification record
                const notificationId = crypto.randomUUID();
                await tx.$executeRaw`
                  INSERT INTO public.event_notification (
                    id,
                    event_id,
                    notification_type,
                    minutes_before,
                    notification_time,
                    notification_date_local,
                    notification_timezone,
                    is_enabled,
                    is_sent,
                    created_at,
                    updated_at
                  ) VALUES (
                    ${notificationId},
                    ${eventId},
                    ${config.notificationType},
                    ${config.minutesBefore},
                    ${schedule.notificationTime},
                    ${schedule.notificationDateLocal},
                    ${schedule.notificationTimezone},
                    ${config.isEnabled},
                    false,
                    NOW(),
                    NOW()
                  )
                `;
                const notification = {
                  id: notificationId,
                  eventId,
                  notificationType: config.notificationType,
                  minutesBefore: config.minutesBefore,
                  notificationTime: schedule.notificationTime,
                  isEnabled: config.isEnabled,
                  isSent: false,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                } as EventNotification;

                created.push(notification);

                logger.ok(
                  `✓ Created ${config.notificationType} notification for event ${eventId}: ` +
                    `${config.minutesBefore}min before at ${schedule.notificationDateLocal} ${schedule.notificationTimezone}`,
                );
              } catch (error) {
                const message = errorMessage(error);
                skipped.push({
                  config,
                  reason: message,
                });

                logger.error(
                  `Failed to create notification for event ${eventId}:`,
                  errorMessage,
                );
              }
            }

            return { created, skipped };
          },
          {
            isolationLevel: "Serializable", // Prevent concurrent update conflicts
            timeout: 10000, // 10 second timeout
          },
        );
      });

      logger.ok(
        `✅ Updated notifications for event ${eventId} (attempt ${attempt}): ` +
          `${result.created.length} created, ${result.skipped.length} skipped`,
      );

      return result;
    } catch (error) {
      logger.error(
        `❌ Update attempt ${attempt} failed for event ${eventId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Delete all notifications for an event with enhanced error handling
   * @param eventId - The event ID
   * @returns Number of deleted notifications
   */
  public async deleteNotificationsForEvent(eventId: string): Promise<number> {
    try {
      // Validate event exists (optional - we might want to clean up orphaned notifications)
      const event = await this.executeWithDatabaseRetry(async () => {
        return await prisma.calendarEvent.findUnique({
          where: { id: eventId },
          select: { id: true },
        });
      });

      if (!event) {
        logger.warn(
          `Event with ID ${eventId} not found, but proceeding with notification cleanup`,
        );
      }

      // Delete all notifications for this event with database retry
      const result = await this.executeWithDatabaseRetry(async () => {
        return await prisma.eventNotification.deleteMany({
          where: { eventId },
        });
      });

      // Remove from retry queue if any notifications were there
      for (const [notificationId, retryInfo] of this.retryQueue.entries()) {
        if (retryInfo.eventId === eventId) {
          this.retryQueue.delete(notificationId);
          logger.info(
            `🗑️ Removed notification ${notificationId} from retry queue`,
          );
        }
      }

      logger.ok(
        `✅ Deleted ${result.count} notifications for event ${eventId}`,
      );
      return result.count;
    } catch (error) {
      logger.error("❌ Failed to delete notifications for event:", error);
      throw error;
    }
  }

  /**
   * Handle events moved to past dates by cleaning up future notifications
   * Implements Requirement 7.1
   * @param eventId - The event ID
   * @param eventStart - The new event start time (in the past)
   * @returns Number of cleaned up notifications
   */
  public async handleEventMovedToPast(
    eventId: string,
    eventStart: Date,
  ): Promise<number> {
    try {
      const now = new Date();

      if (eventStart >= now) {
        logger.info(
          `⏭️ Event ${eventId} is not in the past, no cleanup needed`,
        );
        return 0;
      }

      logger.info(
        `🧹 Cleaning up notifications for event ${eventId} moved to past date: ${eventStart.toISOString()}`,
      );

      // Delete all future notifications for this event
      const result = await this.executeWithDatabaseRetry(async () => {
        return await prisma.eventNotification.deleteMany({
          where: {
            eventId,
            notificationTime: {
              gte: now, // Delete notifications scheduled for now or future
            },
          },
        });
      });

      // Remove from retry queue
      let removedFromRetryQueue = 0;
      for (const [notificationId, retryInfo] of this.retryQueue.entries()) {
        if (retryInfo.eventId === eventId) {
          this.retryQueue.delete(notificationId);
          removedFromRetryQueue++;
        }
      }

      // Log the cleanup operation
      await this.executeWithDatabaseRetry(async () => {
        return await prisma.notificationLog.create({
          data: {
            eventId,
            userId: "system",
            notificationType: "system",
            minutesBefore: 0,
            status: `cleanup: Cleaned up ${result.count} future notifications for event moved to past`,
            sentAt: new Date(),
          },
        });
      });

      logger.ok(
        `✅ Cleaned up ${result.count} future notifications and ${removedFromRetryQueue} retry queue entries for past event ${eventId}`,
      );

      return result.count;
    } catch (error) {
      logger.error(
        `❌ Failed to clean up notifications for past event ${eventId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Process scheduled notifications (background processing method)
   * Queries for notifications due in the current minute and sends them
   * Enhanced with database connection handling and improved error recovery
   */
  public async processScheduledNotifications(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const now = new Date();

    // Round down to the current minute (ignore seconds and milliseconds)
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
      // Only log processing start if there might be notifications

      // Query for all notifications that should be sent by now (current minute or earlier)
      const notificationsToSend = await this.executeWithDatabaseRetry(
        async () => {
          return await prisma.eventNotification.findMany({
            where: {
              notificationTime: {
                lte: currentMinute, // Send notifications scheduled for current minute or earlier
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
            orderBy: {
              notificationTime: "asc",
            },
          });
        },
      );

      // Only log when there are notifications to send
      if (notificationsToSend.length > 0) {
        logger.info(
          `🔍 Processing ${notificationsToSend.length} scheduled notifications for ${currentMinute.toISOString()}`,
        );
      }

      let processedThisRun = 0;
      let failedThisRun = 0;
      let skippedThisRun = 0;

      // Process each notification with enhanced error handling
      for (const notification of notificationsToSend) {
        try {
          // Check if event is still valid (not moved to past)
          if (notification.event.start < now) {
            // Skip notification for past events (reduce logging)
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

            // Remove from retry queue if it was there
            this.retryQueue.delete(notification.id);
          } else {
            failedThisRun++;
            this.failedCount++;

            // Handle retry logic with enhanced error categorization
            await this.handleNotificationFailure(notification, result);
          }
        } catch (error) {
          failedThisRun++;
          this.failedCount++;

          const message = errorMessage(error);

          // Enhanced error handling with better categorization
          const shouldRetry = isRetryableError(error);
          const retryAfterMinutes = this.calculateRetryDelay(error);

          await this.handleNotificationFailure(notification, {
            success: false,
            error: message,
            shouldRetry,
            retryAfterMinutes,
          });

          logger.error(
            `❌ Error processing notification ${notification.id} for event "${notification.event.title}": ${errorMessage}`,
          );
        }
      }

      // Process retry queue with enhanced error handling
      await this.processRetryQueueWithErrorHandling();

      // Update last processed time
      this.lastProcessedAt = new Date();

      // Enhanced logging with more details
      if (
        notificationsToSend.length > 0 ||
        processedThisRun > 0 ||
        failedThisRun > 0
      ) {
        logger.ok(
          `✅ Notification processing complete: ${processedThisRun} sent, ${failedThisRun} failed, ${skippedThisRun} skipped`,
        );
      }

      // Log processing metrics for monitoring
      if (processedThisRun > 0 || failedThisRun > 0) {
        await this.logProcessingMetrics(
          processedThisRun,
          failedThisRun,
          skippedThisRun,
        );
      }
    } catch (error) {
      this.failedCount++;
      const message = errorMessage(error);

      logger.error(
        "❌ Critical error in background notification processing:",
        message,
      );

      // Enhanced system error logging with recovery information
      this.errors.push({
        notificationId: "system",
        eventId: "system",
        userId: "system",
        error: `Background processing failed: ${message}`,
        timestamp: new Date(),
        retryCount: 0,
      });

      // Keep only last 50 errors to prevent memory issues
      if (this.errors.length > 50) {
        this.errors = this.errors.slice(-50);
      }

      // Don't throw the error to prevent service shutdown
      // Instead, log it and continue with next processing cycle
      logger.info("🔄 Service will continue with next processing cycle");
    }
  }

  /**
   * Get current notification system status
   * @returns Current status including pending notifications and processing stats
   */
  public async getNotificationStatus(): Promise<NotificationStatus> {
    try {
      // Count pending notifications (enabled, not sent, notification time in future)
      const pendingCount = await prisma.eventNotification.count({
        where: {
          isEnabled: true,
          isSent: false,
          notificationTime: {
            gte: new Date(),
          },
        },
      });

      // Find next retry time
      let nextRetryAt: Date | undefined;
      for (const retryInfo of this.retryQueue.values()) {
        if (!nextRetryAt || retryInfo.nextRetryAt < nextRetryAt) {
          nextRetryAt = retryInfo.nextRetryAt;
        }
      }

      // Get cleanup status
      const cleanupStatus = this.getCleanupStatus();

      return {
        isRunning: this.isRunning,
        pendingNotifications: pendingCount,
        lastProcessedAt: this.lastProcessedAt,
        processedCount: this.processedCount,
        failedCount: this.failedCount,
        errors: this.errors.slice(-10), // Return last 10 errors
        retryQueueSize: this.retryQueue.size,
        nextRetryAt,
        cleanup: cleanupStatus,
      };
    } catch (error) {
      logger.error("Failed to get notification status:", error);
      throw error;
    }
  }

  /**
   * Send a notification with retry logic
   * @param notification - The notification to send with included event and user data
   * @returns Result indicating success/failure and retry information
   */
  private async sendNotificationWithRetry(
    notification: NotificationEventData,
  ): Promise<NotificationDeliveryResult> {
    try {
      await this.sendNotification(notification);
      return { success: true, shouldRetry: false };
    } catch (error) {
      const message = errorMessage(error);
      const shouldRetry = isRetryableError(error);
      const retryAfterMinutes = this.calculateRetryDelay(error);

      return {
        success: false,
        error: message,
        shouldRetry,
        retryAfterMinutes,
      };
    }
  }

  /**
   * Handle notification failure and manage retry logic
   * @param notification - The failed notification
   * @param result - The delivery result with error information
   */
  private async handleNotificationFailure(
    notification: NotificationEventData,
    result: NotificationDeliveryResult,
  ): Promise<void> {
    const existingRetry = this.retryQueue.get(notification.id);
    const retryCount = existingRetry ? existingRetry.retryCount + 1 : 1;
    const maxRetries = 3;

    // Add to error log
    this.errors.push({
      notificationId: notification.id,
      eventId: notification.eventId,
      userId: notification.event.userId,
      error: result.error || "Unknown error",
      timestamp: new Date(),
      retryCount,
      nextRetryAt:
        result.shouldRetry && retryCount <= maxRetries
          ? new Date(Date.now() + (result.retryAfterMinutes || 5) * MS_PER_MINUTE)
          : undefined,
    });

    // Keep only last 50 errors to prevent memory issues
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }

    // Log the failed notification with retry information
    await this.logNotification(
      notification.eventId,
      notification.event.userId,
      notification.notificationType,
      notification.minutesBefore,
      retryCount <= maxRetries && result.shouldRetry
        ? "retry_scheduled"
        : "failed",
    );

    // Schedule retry if appropriate
    if (result.shouldRetry && retryCount <= maxRetries) {
      const nextRetryAt = new Date(
        Date.now() + (result.retryAfterMinutes || 5) * MS_PER_MINUTE,
      );

      this.retryQueue.set(notification.id, {
        notificationId: notification.id,
        eventId: notification.eventId,
        userId: notification.event.userId,
        retryCount,
        nextRetryAt,
        lastError: result.error || "Unknown error",
        originalNotificationTime: notification.notificationTime,
      });

      // Scheduled retry (reduced logging)
    } else {
      // Max retries reached or non-retryable error
      logger.error(
        `❌ Notification ${notification.id} failed permanently after ${retryCount} attempts: ${result.error}`,
      );

      // Remove from retry queue if it was there
      this.retryQueue.delete(notification.id);
    }
  }

  /**
   * Process notifications in the retry queue with enhanced error handling
   */
  private async processRetryQueueWithErrorHandling(): Promise<void> {
    const now = new Date();
    const retriesToProcess: string[] = [];

    // Find retries that are due
    for (const [notificationId, retryInfo] of this.retryQueue.entries()) {
      if (retryInfo.nextRetryAt <= now) {
        retriesToProcess.push(notificationId);
      }
    }

    if (retriesToProcess.length === 0) {
      return;
    }

    logger.info(
      `🔄 Processing ${retriesToProcess.length} notification retries`,
    );

    // Process each retry with enhanced error handling
    for (const notificationId of retriesToProcess) {
      const retryInfo = this.retryQueue.get(notificationId);
      if (!retryInfo) continue;

      try {
        // Fetch the notification with full event and user data using database retry
        const notification = await this.executeWithDatabaseRetry(async () => {
          return await prisma.eventNotification.findUnique({
            where: { id: notificationId },
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
        });

        if (!notification) {
          logger.warn(
            `⚠️ Notification ${notificationId} not found for retry, removing from queue`,
          );
          this.retryQueue.delete(notificationId);
          continue;
        }

        // Check if notification is still valid (not sent, still enabled, event not in past)
        if (
          notification.isSent ||
          !notification.isEnabled ||
          notification.event.start < now
        ) {
          logger.info(
            `⏭️ Skipping retry for notification ${notificationId} - no longer valid`,
          );
          this.retryQueue.delete(notificationId);

          // If event moved to past, clean up
          if (notification.event.start < now) {
            await this.handleEventMovedToPast(
              notification.eventId,
              notification.event.start,
            );
          }

          continue;
        }

        // Attempt to send the notification
        const result = await this.sendNotificationWithRetry(notification);

        if (result.success) {
          // Retry successful (reduced logging)
          this.processedCount++;
          this.retryQueue.delete(notificationId);
        } else {
          // Retry failed (reduced logging)
          await this.handleNotificationFailure(notification, result);
        }
      } catch (error) {
        logger.error(
          `❌ Error processing retry for notification ${notificationId}:`,
          error,
        );

        // Enhanced retry error handling
        const updatedRetryInfo = { ...retryInfo };
        updatedRetryInfo.retryCount++;
        updatedRetryInfo.lastError =
          errorMessage(error);

        // Use smarter retry logic based on error type
        const shouldContinueRetrying =
          isRetryableError(error) && updatedRetryInfo.retryCount <= 3;

        if (shouldContinueRetrying) {
          const retryDelay = this.calculateRetryDelay(error) * MS_PER_MINUTE; // Convert to milliseconds
          updatedRetryInfo.nextRetryAt = new Date(Date.now() + retryDelay);
          this.retryQueue.set(notificationId, updatedRetryInfo);

          // Scheduled retry (reduced logging)
        } else {
          // Permanently failed notification (reduced logging)
          this.retryQueue.delete(notificationId);

          // Log permanent failure
          await this.logNotificationPermanentFailure(
            notificationId,
            updatedRetryInfo,
          );
        }
      }
    }
  }

  /**
   * Log processing metrics for monitoring
   * @param processed - Number of notifications processed successfully
   * @param failed - Number of notifications that failed
   * @param skipped - Number of notifications skipped
   */
  private async logProcessingMetrics(
    processed: number,
    failed: number,
    skipped: number,
  ): Promise<void> {
    try {
      await this.executeWithDatabaseRetry(async () => {
        return await prisma.notificationLog.create({
          data: {
            eventId: "system",
            userId: "system",
            notificationType: "system",
            minutesBefore: 0,
            status: `processing_metrics: ${processed} sent, ${failed} failed, ${skipped} skipped`,
            sentAt: new Date(),
          },
        });
      });
    } catch (error) {
      logger.error("Failed to log processing metrics:", error);
      // Don't throw - this is just for monitoring
    }
  }

  /**
   * Log permanent notification failure
   * @param notificationId - The notification ID
   * @param retryInfo - Retry information
   */
  private async logNotificationPermanentFailure(
    notificationId: string,
    retryInfo: NotificationRetryInfo,
  ): Promise<void> {
    try {
      await this.executeWithDatabaseRetry(async () => {
        return await prisma.notificationLog.create({
          data: {
            eventId: retryInfo.eventId,
            userId: retryInfo.userId,
            notificationType: "system",
            minutesBefore: 0,
            status: `permanent_failure: Notification ${notificationId} permanently failed after ${retryInfo.retryCount} attempts. Last error: ${retryInfo.lastError}`,
            sentAt: new Date(),
          },
        });
      });
    } catch (error) {
      logger.error("Failed to log permanent failure:", error);
      // Don't throw - this is just for logging
    }
  }

  /**
   * Calculate retry delay based on error type and retry count
   * @param error - The error that occurred
   * @returns Delay in minutes before next retry
   */
  private calculateRetryDelay(error: unknown): number {
    if (!(error instanceof Error)) {
      return 5; // Default 5 minutes
    }

    const errorMessage = error.message.toLowerCase();

    // Rate limiting errors - longer delay
    if (errorMessage.includes("rate limit")) {
      return 15; // 15 minutes
    }

    // Network/connection errors - shorter delay
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection")
    ) {
      return 2; // 2 minutes
    }

    // Service unavailable - medium delay
    if (
      errorMessage.includes("service unavailable") ||
      errorMessage.includes("bad gateway")
    ) {
      return 10; // 10 minutes
    }

    // Default delay
    return 5; // 5 minutes
  }

  /**
   * Send a single notification
   * @param notification - The notification to send with included event and user data
   */
  private async sendNotification(
    notification: NotificationEventData,
  ): Promise<void> {
    const { event } = notification;
    const user = event.user;
    const userSettings = user.settings;

    logger.info(
      `📧 Sending ${notification.notificationType} notification for event "${event.title}" to ${user.email}`,
    );

    try {
      // Check if user has this type of notification enabled
      if (
        notification.notificationType === "email" &&
        userSettings?.emailNotifications === false
      ) {
        logger.info(
          `⏭️ Skipping email notification - user has email notifications disabled`,
        );
        await this.markNotificationAsSent(notification.id, "skipped");
        await this.logNotification(
          event.id,
          user.id,
          notification.notificationType,
          notification.minutesBefore,
          "skipped",
          "User has email notifications disabled",
        );
        return;
      }

      if (
        notification.notificationType === "browser" &&
        userSettings?.browserNotifications === false
      ) {
        logger.info(
          `⏭️ Skipping browser notification - user has browser notifications disabled`,
        );
        await this.markNotificationAsSent(notification.id, "skipped");
        await this.logNotification(
          event.id,
          user.id,
          notification.notificationType,
          notification.minutesBefore,
          "skipped",
          "User has browser notifications disabled",
        );
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

      // Log the successful notification
      await this.logNotification(
        event.id,
        user.id,
        notification.notificationType,
        notification.minutesBefore,
        "sent",
      );

      logger.ok(
        `✅ Successfully sent ${notification.notificationType} notification for event "${event.title}"`,
      );
    } catch (error) {
      const message = errorMessage(error);

      logger.error(
        `❌ Failed to send notification for event "${event.title}":`,
        message,
      );

      // Log the failed notification (but don't mark as sent so it can be retried)
      await this.logNotification(
        event.id,
        user.id,
        notification.notificationType,
        notification.minutesBefore,
        "failed",
        message,
      );

      throw error;
    }
  }

  /**
   * Send email notification using Resend with enhanced error handling and user preferences
   * @param event - The calendar event
   * @param user - The user to send to
   * @param minutesBefore - Minutes before the event
   */
  private async sendEmailNotification(
    event: EventWithRelations & {
      user: User & { settings?: UserSettings | null };
    },
    user: User & { settings?: UserSettings | null },
    minutesBefore: number,
  ): Promise<void> {
    // Validate Resend configuration
    if (!this.resend) {
      const error = new Error(
        "Email service not configured - RESEND_API_KEY missing",
      );
      logger.error(`❌ ${error.message} for user ${user.email}`);
      throw error;
    }

    // Validate user email
    if (!user.email || !this.isValidEmail(user.email)) {
      const error = new Error(`Invalid email address: ${user.email}`);
      logger.error(`❌ ${error.message}`);
      throw error;
    }

    // Check user email notification preferences
    const userSettings = user.settings;
    if (userSettings?.emailNotifications === false) {
      logger.info(`⏭️ Email notifications disabled for user ${user.email}`);
      return; // This is handled at a higher level, but double-check here
    }

    try {
      // Generate enhanced email content with performance optimization
      const emailContent = await this.generateEnhancedEmailContent(
        event,
        user,
        minutesBefore,
      );

      // Prepare email with enhanced formatting
      const emailSubject = this.generateEmailSubject(event, minutesBefore);

      // Send email via Resend with comprehensive error handling
      const result = await this.sendEmailWithRetryLogic({
        from: this.getFromAddress(),
        to: user.email,
        subject: emailSubject,
        html: emailContent.html,
        text: emailContent.text, // Add plain text version for better deliverability
      });

      logger.ok(
        `✅ Email notification sent successfully to ${user.email} for event "${event.title}" - Resend ID: ${result.data?.id}`,
      );

      // Log successful delivery metrics
      this.logEmailDeliveryMetrics(
        user.id,
        event.id,
        "success",
        result.data?.id,
      );
    } catch (error) {
      // Enhanced error handling with specific error types
      const enhancedError = this.enhanceEmailError(error, user, event);
      logger.error(
        `❌ Failed to send email notification to ${user.email} for event "${event.title}":`,
        enhancedError.message,
      );

      // Log failed delivery metrics
      this.logEmailDeliveryMetrics(
        user.id,
        event.id,
        "failed",
        undefined,
        enhancedError.message,
      );

      throw enhancedError;
    }
  }

  /**
   * Generate enhanced email content with better formatting and performance optimization
   * @param event - The calendar event
   * @param user - The user receiving the email
   * @param minutesBefore - Minutes before the event
   * @returns Enhanced email content with HTML and text versions
   */
  private async generateEnhancedEmailContent(
    event: EventWithRelations & {
      user: User & { settings?: UserSettings | null };
    },
    user: User & { settings?: UserSettings | null },
    minutesBefore: number,
  ): Promise<{ html: string; text: string }> {
    try {
      // Get user preferences for formatting
      const userSettings = user.settings;
      const userTheme = userSettings?.theme || "light";
      const timeFormat = userSettings?.timeFormat || "12h";
      const timezone = userSettings?.timezone || "UTC";

      // Format event details with user preferences
      const formattedDetails = this.formatEventDetailsForEmail(
        event,
        timeFormat,
        timezone,
        minutesBefore,
      );

      // Generate HTML version using React Email template with caching
      const emailHTML = await this.renderEmailTemplateWithCaching(
        event,
        user,
        formattedDetails,
        userTheme as "light" | "dark" | "system",
      );

      // Generate plain text version for better deliverability
      const emailText = this.generatePlainTextEmail(event, formattedDetails);

      return {
        html: emailHTML,
        text: emailText,
      };
    } catch (error) {
      logger.error("Failed to generate email content:", error);
      throw new Error(
        `Email content generation failed: ${errorMessage(error)}`,
      );
    }
  }

  /**
   * Format event details for email with user preferences
   * @param event - The calendar event
   * @param timeFormat - User's preferred time format (12h/24h)
   * @param timezone - User's timezone
   * @param minutesBefore - Minutes before the event
   * @returns Formatted event details
   */
  private formatEventDetailsForEmail(
    event: EventWithRelations,
    timeFormat: string,
    timezone: string,
    minutesBefore: number,
  ) {
    // Format time until event with more precision
    const timeUntilEvent = this.formatTimeUntilEventEnhanced(event.start);

    // Format date with timezone consideration
    const eventDate = this.formatDateWithTimezone(event.start, timezone);

    // Format time based on user preference
    const eventTime = event.allDay
      ? "All Day"
      : this.formatTimeWithPreference(event.start, timeFormat, timezone);

    // Enhanced duration calculation
    const duration = this.calculateEventDuration(event.start, event.end);

    return {
      timeUntilEvent,
      eventDate,
      eventTime,
      duration,
      location: event.location?.trim() || undefined,
      categoryName: event.category?.name || undefined,
      categoryColor: event.category?.color || event.calendar?.color || "blue",
      description: this.sanitizeDescription(event.description),
      reminderText: this.formatReminderText(minutesBefore),
    };
  }

  /**
   * Render email template with caching for performance optimization
   * @param event - The calendar event
   * @param user - The user receiving the email
   * @param formattedDetails - Pre-formatted event details
   * @param userTheme - User's theme preference
   * @returns Rendered HTML email
   */
  private async renderEmailTemplateWithCaching(
    event: CalendarEvent,
    user: User,
    formattedDetails: FormattedEventDetails,
    userTheme: "light" | "dark" | "system",
  ): Promise<string> {
    // Create cache key for template rendering (for performance)
    const cacheKey = this.generateTemplateCacheKey(
      event,
      user,
      formattedDetails,
      userTheme,
    );

    // Check cache first (simple in-memory cache for this session)
    if (this.templateCache && this.templateCache.has(cacheKey)) {
      logger.info(`📋 Using cached email template for event ${event.id}`);
      return this.templateCache.get(cacheKey)!;
    }

    // Render template with enhanced props
    if (!EventReminderEmail) {
      throw new Error("Email template not available");
    }
    const emailHTML = await render(
      EventReminderEmail({
        eventTitle: event.title,
        eventDate: formattedDetails.eventDate,
        eventTime: formattedDetails.eventTime,
        eventLocation: formattedDetails.location,
        categoryName: formattedDetails.categoryName,
        categoryColor: formattedDetails.categoryColor,
        description: formattedDetails.description,
        timeUntilEvent: formattedDetails.timeUntilEvent,
        duration: formattedDetails.duration,
        reminderText: formattedDetails.reminderText,
        userTheme,
        userName: user.name,
        userEmail: user.email,
      }),
    );

    // Cache the rendered template (with size limit)
    if (!this.templateCache) {
      this.templateCache = new Map();
    }

    // Limit cache size to prevent memory issues
    if (this.templateCache.size >= 100) {
      const firstKey = this.templateCache.keys().next().value;
      if (firstKey) {
        this.templateCache.delete(firstKey);
      }
    }

    this.templateCache.set(cacheKey, emailHTML);

    return emailHTML;
  }

  /**
   * Generate plain text version of email for better deliverability
   * @param event - The calendar event
   * @param formattedDetails - Pre-formatted event details
   * @returns Plain text email content
   */
  private generatePlainTextEmail(
    event: CalendarEvent,
    formattedDetails: FormattedEventDetails,
  ): string {
    const lines = [
      "📅 ROCANI - Event Reminder",
      "",
      `Event: ${event.title}`,
      `Starting: ${formattedDetails.timeUntilEvent}`,
      "",
      `Date: ${formattedDetails.eventDate}`,
      `Time: ${formattedDetails.eventTime}`,
    ];

    if (formattedDetails.duration) {
      lines.push(`Duration: ${formattedDetails.duration}`);
    }

    if (formattedDetails.location) {
      lines.push(`Location: ${formattedDetails.location}`);
    }

    if (formattedDetails.categoryName) {
      lines.push(`Category: ${formattedDetails.categoryName}`);
    }

    if (formattedDetails.description) {
      lines.push("", "Description:", formattedDetails.description);
    }

    lines.push(
      "",
      "---",
      "This reminder was sent because you have email notifications enabled.",
      "You can manage your notification preferences in your calendar settings.",
    );

    return lines.join("\n");
  }

  /**
   * Generate email subject with context
   * @param event - The calendar event
   * @param minutesBefore - Minutes before the event
   * @returns Email subject line
   */
  private generateEmailSubject(
    event: CalendarEvent,
    minutesBefore: number,
  ): string {
    const reminderText = this.formatReminderText(minutesBefore);
    return `📅 Reminder: ${event.title} (${reminderText})`;
  }

  /**
   * Send email with enhanced retry logic and error handling
   * @param emailData - Email data to send
   * @returns Resend API response
   */
  private async sendEmailWithRetryLogic(emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }) {
    const maxRetries = 2; // Immediate retry attempts
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const result = await this.resend!.emails.send(emailData);

        // Check for API errors in response
        if (result.error) {
          throw new Error(`Resend API error: ${result.error.message}`);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        if (attempt <= maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          logger.warn(
            `⚠️ Email send attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Enhance email errors with more context and categorization
   * @param error - Original error
   * @param user - User context
   * @param event - Event context
   * @returns Enhanced error with better categorization
   */
  private enhanceEmailError(
    error: unknown,
    user: User,
    event: CalendarEvent,
  ): Error {
    const originalMessage =
      errorMessage(error);
    const errorLower = originalMessage.toLowerCase();

    // Categorize errors for better handling
    if (
      errorLower.includes("invalid email") ||
      errorLower.includes("malformed")
    ) {
      return new Error(`Invalid email address: ${user.email}`);
    }

    if (
      errorLower.includes("rate limit") ||
      errorLower.includes("too many requests")
    ) {
      return new Error(`Email rate limit exceeded for ${user.email}`);
    }

    if (
      errorLower.includes("authentication") ||
      errorLower.includes("unauthorized")
    ) {
      return new Error(
        "Email service authentication failed - check RESEND_API_KEY",
      );
    }

    if (errorLower.includes("network") || errorLower.includes("connection")) {
      return new Error(
        `Network error sending email to ${user.email}: ${originalMessage}`,
      );
    }

    if (errorLower.includes("timeout")) {
      return new Error(`Email delivery timeout for ${user.email}`);
    }

    // Generic enhanced error
    return new Error(
      `Email delivery failed for event "${event.title}" to ${user.email}: ${originalMessage}`,
    );
  }

  /**
   * Execute database operation with retry logic for connection issues
   * Implements Requirement 7.4 - graceful handling of database connection issues
   * @param operation - Database operation to execute
   * @param maxRetries - Maximum number of retry attempts
   * @returns Result of the database operation
   */
  private async executeWithDatabaseRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Unknown database error");

        // Check if this is a retryable database error
        if (isRetryableDatabaseError(error) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s
          logger.warn(
            `⚠️ Database operation attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Non-retryable error or max retries reached
        logger.error(
          `❌ Database operation failed after ${attempt} attempts: ${lastError.message}`,
        );
        throw lastError;
      }
    }

    throw (
      lastError ||
      new Error("Database operation failed after all retry attempts")
    );
  }

  /**
   * Handle concurrent notification updates with proper locking
   * Implements Requirement 7.6 - handle concurrent notification updates properly
   * @param eventId - The event ID
   * @param updateOperation - The update operation to perform
   * @returns Result of the update operation
   */
  public async handleConcurrentNotificationUpdate<T>(
    eventId: string,
    updateOperation: () => Promise<T>,
  ): Promise<T> {
    const lockKey = `notification_update_${eventId}`;
    const maxWaitTime = 30000; // 30 seconds max wait
    const lockCheckInterval = 100; // Check every 100ms

    // Simple in-memory lock mechanism (for single instance)
    // In a multi-instance setup, you'd use Redis or database-level locking
    if (!this.updateLocks) {
      this.updateLocks = new Map<
        string,
        { locked: boolean; timestamp: number }
      >();
    }

    const startTime = Date.now();

    // Wait for lock to be available
    while (
      this.updateLocks.has(lockKey) &&
      this.updateLocks.get(lockKey)!.locked
    ) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error(
          `Timeout waiting for notification update lock for event ${eventId}`,
        );
      }

      // Check if lock is stale (older than 5 minutes)
      const lockInfo = this.updateLocks.get(lockKey)!;
      if (Date.now() - lockInfo.timestamp > 300000) {
        logger.warn(`⚠️ Removing stale lock for event ${eventId}`);
        this.updateLocks.delete(lockKey);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, lockCheckInterval));
    }

    // Acquire lock
    this.updateLocks.set(lockKey, { locked: true, timestamp: Date.now() });

    try {
      logger.info(`🔒 Acquired update lock for event ${eventId}`);
      const result = await updateOperation();
      logger.info(`🔓 Released update lock for event ${eventId}`);
      return result;
    } finally {
      // Always release lock
      this.updateLocks.delete(lockKey);
    }
  }

  /**
   * Batch update notifications for multiple events (for efficiency)
   * @param updates - Array of event updates
   * @returns Results of all updates
   */
  public async batchUpdateNotifications(
    updates: Array<{
      eventId: string;
      eventStart: Date;
      notifications: NotificationConfig[];
    }>,
  ): Promise<Array<CreateNotificationResult & { eventId: string }>> {
    const results: Array<CreateNotificationResult & { eventId: string }> = [];

    // Process updates in batches to avoid overwhelming the database
    const batchSize = 5;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      const batchPromises = batch.map(async (update) => {
        try {
          const result = await this.handleConcurrentNotificationUpdate(
            update.eventId,
            () =>
              this.updateNotificationsForEvent(
                update.eventId,
                update.eventStart,
                update.notifications,
              ),
          );
          return { ...result, eventId: update.eventId };
        } catch (error) {
          logger.error(
            `❌ Failed to update notifications for event ${update.eventId}:`,
            error,
          );
          return {
            eventId: update.eventId,
            created: [],
            skipped: [
              {
                config: {
                  notificationType: "email",
                  minutesBefore: 0,
                  isEnabled: true,
                } as NotificationConfig,
                reason:
                  errorMessage(error),
              },
            ],
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < updates.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Clean up notifications for events that no longer exist (orphaned notifications)
   * @returns Number of cleaned up notifications
   */
  public async cleanupOrphanedNotifications(): Promise<number> {
    try {
      logger.info("🧹 Cleaning up orphaned notifications...");

      const result = await this.executeWithDatabaseRetry(async () => {
        // Find notifications where the event no longer exists
        return await prisma.$executeRaw`
          DELETE FROM event_notification 
          WHERE event_id NOT IN (SELECT id FROM calendar_event)
        `;
      });

      const deletedCount = typeof result === "number" ? result : 0;

      if (deletedCount > 0) {
        logger.ok(`✅ Cleaned up ${deletedCount} orphaned notifications`);

        // Log the cleanup operation
        await this.executeWithDatabaseRetry(async () => {
          return await prisma.notificationLog.create({
            data: {
              eventId: "system",
              userId: "system",
              notificationType: "system",
              minutesBefore: 0,
              status: `orphan_cleanup: Cleaned up ${deletedCount} orphaned notifications`,
              sentAt: new Date(),
            },
          });
        });
      }

      return deletedCount;
    } catch (error) {
      logger.error("❌ Failed to clean up orphaned notifications:", error);
      throw error;
    }
  }

  // Helper methods for enhanced email functionality

  /**
   * Validate email address format
   * @param email - Email to validate
   * @returns Whether email is valid
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Get configured from address
   * @returns From email address
   */
  private getFromAddress(): string {
    return (
      process.env.EMAIL_FROM_ADDRESS ||
      "Calendar Reminders <notifications@mailing.roan.dev>"
    );
  }

  /**
   * Format time until event with enhanced precision
   * @param eventStart - Event start time
   * @returns Enhanced formatted time string
   */
  private formatTimeUntilEventEnhanced(eventStart: Date): string {
    const now = new Date();
    const timeDiff = eventStart.getTime() - now.getTime();
    const minutesUntil = Math.floor(timeDiff / (1000 * 60));
    const hoursUntil = Math.floor(minutesUntil / 60);
    const daysUntil = Math.floor(hoursUntil / 24);

    if (timeDiff <= 0) {
      return "now";
    }

    if (daysUntil > 0) {
      const remainingHours = hoursUntil % 24;
      if (remainingHours > 0) {
        return `in ${daysUntil}d ${remainingHours}h`;
      }
      return `in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`;
    }

    if (hoursUntil > 0) {
      const remainingMinutes = minutesUntil % 60;
      if (remainingMinutes > 0) {
        return `in ${hoursUntil}h ${remainingMinutes}m`;
      }
      return `in ${hoursUntil} hour${hoursUntil > 1 ? "s" : ""}`;
    }

    return `in ${minutesUntil} minute${minutesUntil > 1 ? "s" : ""}`;
  }

  /**
   * Format date with timezone consideration
   * @param date - Date to format
   * @param timezone - User's timezone
   * @returns Formatted date string
   */
  private formatDateWithTimezone(date: Date, timezone: string): string {
    try {
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: timezone,
      });
    } catch {
      // Fallback to UTC if timezone is invalid
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }

  /**
   * Format time with user preference
   * @param date - Date to format
   * @param timeFormat - User's time format preference
   * @param timezone - User's timezone
   * @returns Formatted time string
   */
  private formatTimeWithPreference(
    date: Date,
    timeFormat: string,
    timezone: string,
  ): string {
    const is24Hour = timeFormat === "24h";

    try {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: !is24Hour,
        timeZone: timezone,
      });
    } catch {
      // Fallback to UTC if timezone is invalid
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: !is24Hour,
      });
    }
  }

  /**
   * Calculate event duration
   * @param start - Event start time
   * @param end - Event end time
   * @returns Formatted duration string
   */
  private calculateEventDuration(start: Date, end: Date): string | undefined {
    const durationMs = end.getTime() - start.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    if (durationMinutes <= 0) {
      return undefined;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? "s" : ""}`;
    } else {
      return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    }
  }

  /**
   * Sanitize description for email
   * @param description - Raw description
   * @returns Sanitized description
   */
  private sanitizeDescription(description: string | null): string | undefined {
    if (!description) return undefined;

    // Basic sanitization - remove excessive whitespace and limit length
    const sanitized = description.trim().replace(/\s+/g, " ").substring(0, 500); // Limit to 500 characters

    return sanitized || undefined;
  }

  /**
   * Format reminder text
   * @param minutesBefore - Minutes before event
   * @returns Formatted reminder text
   */
  private formatReminderText(minutesBefore: number): string {
    if (minutesBefore < 60) {
      return `${minutesBefore} min before`;
    }

    const hours = Math.floor(minutesBefore / 60);
    const remainingMinutes = minutesBefore % 60;

    if (remainingMinutes === 0) {
      return `${hours} hour${hours > 1 ? "s" : ""} before`;
    }

    return `${hours}h ${remainingMinutes}m before`;
  }

  /**
   * Generate cache key for template rendering
   * @param event - Calendar event
   * @param user - User
   * @param formattedDetails - Formatted details
   * @param userTheme - User theme
   * @returns Cache key string
   */
  private generateTemplateCacheKey(
    event: CalendarEvent,
    user: User,
    formattedDetails: FormattedEventDetails,
    userTheme: string,
  ): string {
    // Create a hash-like key based on relevant data
    const keyData = {
      eventId: event.id,
      eventTitle: event.title,
      eventStart: event.start.toISOString(),
      userTheme,
      hasLocation: !!formattedDetails.location,
      hasDescription: !!formattedDetails.description,
      categoryColor: formattedDetails.categoryColor,
    };

    return JSON.stringify(keyData);
  }

  /**
   * Log email delivery metrics for monitoring
   * @param userId - User ID
   * @param eventId - Event ID
   * @param status - Delivery status
   * @param resendId - Resend message ID
   * @param errorMessage - Error message if failed
   */
  private logEmailDeliveryMetrics(
    userId: string,
    eventId: string,
    status: "success" | "failed",
    resendId?: string,
    errorMessage?: string,
  ): void {
    const logData = {
      userId,
      eventId,
      status,
      resendId,
      errorMessage,
      timestamp: new Date().toISOString(),
    };

    if (status === "success") {
      logger.info(`📊 Email delivery success:`, logData);
    } else {
      logger.error(`📊 Email delivery failed:`, logData);
    }
  }

  /**
   * Send browser notification (placeholder for now)
   * @param event - The calendar event
   * @param user - The user to send to
   * @param minutesBefore - Minutes before the event
   */
  private async sendBrowserNotification(
    event: CalendarEvent,
    user: User,
    minutesBefore: number,
  ): Promise<void> {
    // For now, just log browser notifications
    // In a real implementation, you would send this via WebSocket or push notification
    logger.info(
      `🔔 Browser notification would be sent to ${user.email} for event "${event.title}" (${minutesBefore} min before)`,
    );
  }

  /**
   * Mark notification as sent in the database
   * @param notificationId - The notification ID
   * @param status - The status (sent, skipped, etc.)
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
   * Log notification to database with comprehensive status tracking
   * @param eventId - The event ID
   * @param userId - The user ID
   * @param notificationType - The notification type
   * @param minutesBefore - Minutes before the event
   * @param status - The status (sent, failed, skipped, retry_scheduled, processing)
   * @param errorMessage - Optional error message for failed notifications
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
          sentAt: new Date(),
          status: errorMessage ? `${status}: ${errorMessage}` : status,
        },
      });

      // Log comprehensive information for monitoring
      const logLevel =
        status === "sent" ? "info" : status === "failed" ? "error" : "warn";
      const logMessage = `📊 Notification logged - Event: ${eventId}, User: ${userId}, Type: ${notificationType}, Status: ${status}`;

      if (logLevel === "error") {
        logger.error(logMessage, errorMessage ? { error: errorMessage } : "");
      } else if (logLevel === "warn") {
        logger.warn(logMessage);
      } else {
        logger.info(logMessage);
      }
    } catch (error) {
      logger.error("Failed to log notification:", error);
      // Don't throw here as logging failure shouldn't break notification sending
    }
  }

  /**
   * Format time until event for display
   * @param eventStart - The event start time
   * @returns Formatted time string
   */
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

  /**
   * Get detailed retry queue information for monitoring
   * @returns Array of retry information for all queued notifications
   */
  public getRetryQueueInfo(): NotificationRetryInfo[] {
    return Array.from(this.retryQueue.values()).sort(
      (a, b) => a.nextRetryAt.getTime() - b.nextRetryAt.getTime(),
    );
  }

  /**
   * Clear retry queue (for testing or emergency situations)
   * @returns Number of retries cleared
   */
  public clearRetryQueue(): number {
    const count = this.retryQueue.size;
    this.retryQueue.clear();
    logger.info(`🧹 Cleared ${count} notifications from retry queue`);
    return count;
  }

  /**
   * Clean up old notification logs and maintenance tasks
   * Implements automatic cleanup process with configurable retention period
   * @param retentionDays - Number of days to retain logs (default: 30)
   * @returns Cleanup statistics and performance metrics
   */
  public async cleanupOldNotifications(retentionDays: number = 30): Promise<{
    deletedLogs: number;
    deletedNotifications: number;
    cleanupDuration: number;
    retentionCutoff: Date;
    maintenanceResults: {
      vacuumedTables: string[];
      reindexedTables: string[];
      analyzedTables: string[];
    };
  }> {
    const startTime = Date.now();
    const retentionCutoff = new Date(
      Date.now() - retentionDays * MS_PER_DAY,
    );

    logger.info(
      `🧹 Starting notification cleanup - retaining logs newer than ${retentionCutoff.toISOString()}`,
    );

    try {
      // Step 1: Clean up old notification logs
      const deletedLogsResult = await prisma.notificationLog.deleteMany({
        where: {
          createdAt: {
            lt: retentionCutoff,
          },
        },
      });

      logger.ok(`✅ Deleted ${deletedLogsResult.count} old notification logs`);

      // Step 2: Clean up old sent notifications that are no longer needed
      // Only delete notifications that are:
      // - Already sent (isSent = true)
      // - Older than retention period
      // - Associated with events that have already passed
      const deletedNotificationsResult =
        await prisma.eventNotification.deleteMany({
          where: {
            isSent: true,
            createdAt: {
              lt: retentionCutoff,
            },
            // Only delete notifications for events that have already ended
            event: {
              end: {
                lt: new Date(Date.now() - 7 * MS_PER_DAY), // Events ended more than 7 days ago
              },
            },
          },
        });

      logger.ok(
        `✅ Deleted ${deletedNotificationsResult.count} old sent notifications`,
      );

      const deletedStalePendingNotificationsResult =
        await prisma.eventNotification.deleteMany({
          where: {
            isSent: false,
            notificationTime: {
              lt: new Date(),
            },
          },
        });

      logger.ok(
        `✅ Deleted ${deletedStalePendingNotificationsResult.count} stale pending notifications`,
      );

      // Step 3: Perform database maintenance tasks
      const maintenanceResults = await this.performDatabaseMaintenance();

      const cleanupDuration = Date.now() - startTime;
      const totalDeletedNotifications =
        deletedNotificationsResult.count +
        deletedStalePendingNotificationsResult.count;

      // Log cleanup performance metrics
      logger.info(
        `🎯 Cleanup completed in ${cleanupDuration}ms - Logs: ${deletedLogsResult.count}, Notifications: ${totalDeletedNotifications}`,
      );

      // Store last cleanup stats for monitoring
      this.lastCleanupStats = {
        timestamp: new Date(),
        deletedLogs: deletedLogsResult.count,
        deletedNotifications: totalDeletedNotifications,
        duration: cleanupDuration,
      };

      // Log cleanup statistics for monitoring
      await this.logCleanupStatistics({
        deletedLogs: deletedLogsResult.count,
        deletedNotifications: totalDeletedNotifications,
        cleanupDuration,
        retentionDays,
        retentionCutoff,
      });

      return {
        deletedLogs: deletedLogsResult.count,
        deletedNotifications: totalDeletedNotifications,
        cleanupDuration,
        retentionCutoff,
        maintenanceResults,
      };
    } catch (error) {
      const cleanupDuration = Date.now() - startTime;
      const message = errorMessage(error);

      logger.error(
        `❌ Cleanup failed after ${cleanupDuration}ms:`,
        message,
      );

      // Log cleanup failure
      await this.logCleanupStatistics({
        deletedLogs: 0,
        deletedNotifications: 0,
        cleanupDuration,
        retentionDays,
        retentionCutoff,
        error: message,
      });

      throw new Error(`Notification cleanup failed: ${errorMessage}`);
    }
  }

  /**
   * Perform database maintenance tasks for notification tables
   * @returns Results of maintenance operations
   */
  private async performDatabaseMaintenance(): Promise<{
    vacuumedTables: string[];
    reindexedTables: string[];
    analyzedTables: string[];
  }> {
    const maintenanceResults = {
      vacuumedTables: [] as string[],
      reindexedTables: [] as string[],
      analyzedTables: [] as string[],
    };

    try {
      logger.info("🔧 Starting database maintenance tasks...");

      // Note: These operations are PostgreSQL-specific
      // In a production environment, you might want to check the database type first

      const notificationTables = [
        "notification_log",
        "event_notification",
        "calendar_event",
      ];

      // Analyze tables to update statistics (safe operation)
      for (const table of notificationTables) {
        try {
          await prisma.$executeRawUnsafe(`ANALYZE ${table};`);
          maintenanceResults.analyzedTables.push(table);
          logger.ok(`✅ Analyzed table: ${table}`);
        } catch (error) {
          logger.warn(
            `⚠️ Failed to analyze table ${table}:`,
            errorMessage(error),
          );
        }
      }

      // Reindex notification tables if needed (more intensive operation)
      // Only do this if we're in a maintenance window or low-traffic period
      const shouldReindex = await this.shouldPerformReindexing();

      if (shouldReindex) {
        const indexesToReindex = [
          "idx_event_notification_time_enabled_sent",
          "idx_notification_log_sent_at_status",
          "idx_notification_log_user_sent",
        ];

        for (const index of indexesToReindex) {
          try {
            await prisma.$executeRawUnsafe(`REINDEX INDEX ${index};`);
            maintenanceResults.reindexedTables.push(index);
            logger.ok(`✅ Reindexed: ${index}`);
          } catch (error) {
            logger.warn(
              `⚠️ Failed to reindex ${index}:`,
              errorMessage(error),
            );
          }
        }
      }

      // Vacuum tables to reclaim space (only if significant cleanup occurred)
      // This is a more intensive operation, so we're conservative about when to run it
      const shouldVacuum = await this.shouldPerformVacuum();

      if (shouldVacuum) {
        for (const table of ["notification_log", "event_notification"]) {
          try {
            await prisma.$executeRawUnsafe(`VACUUM ${table};`);
            maintenanceResults.vacuumedTables.push(table);
            logger.ok(`✅ Vacuumed table: ${table}`);
          } catch (error) {
            logger.warn(
              `⚠️ Failed to vacuum table ${table}:`,
              errorMessage(error),
            );
          }
        }
      }

      logger.ok("🎯 Database maintenance completed successfully");
      return maintenanceResults;
    } catch (error) {
      logger.error(
        "❌ Database maintenance failed:",
        errorMessage(error),
      );
      return maintenanceResults;
    }
  }

  /**
   * Determine if reindexing should be performed
   * @returns Whether reindexing is recommended
   */
  private async shouldPerformReindexing(): Promise<boolean> {
    try {
      // Check if it's a low-traffic time (e.g., between 2 AM and 4 AM)
      const currentHour = new Date().getHours();
      const isLowTrafficTime = currentHour >= 2 && currentHour <= 4;

      // Check table sizes to see if reindexing is worthwhile
      const notificationLogCount = await prisma.notificationLog.count();
      const eventNotificationCount = await prisma.eventNotification.count();

      // Only reindex if we have significant data and it's low-traffic time
      const hasSignificantData =
        notificationLogCount > 10000 || eventNotificationCount > 5000;

      return isLowTrafficTime && hasSignificantData;
    } catch (error) {
      logger.warn("Failed to determine reindexing necessity:", error);
      return false;
    }
  }

  /**
   * Determine if vacuum should be performed
   * @returns Whether vacuum is recommended
   */
  private async shouldPerformVacuum(): Promise<boolean> {
    try {
      // Only vacuum if we're in a maintenance window and have deleted significant data
      const currentHour = new Date().getHours();
      const isMaintenanceWindow = currentHour >= 2 && currentHour <= 4;

      // Check if we have a significant amount of data that might benefit from vacuum
      const notificationLogCount = await prisma.notificationLog.count();

      // Only vacuum if we have substantial data (vacuum is expensive)
      return isMaintenanceWindow && notificationLogCount > 50000;
    } catch (error) {
      logger.warn("Failed to determine vacuum necessity:", error);
      return false;
    }
  }

  /**
   * Log cleanup statistics for monitoring and performance tracking
   * @param stats - Cleanup statistics to log
   */
  private async logCleanupStatistics(stats: {
    deletedLogs: number;
    deletedNotifications: number;
    cleanupDuration: number;
    retentionDays: number;
    retentionCutoff: Date;
    error?: string;
  }): Promise<void> {
    try {
      // Create a cleanup log entry in the notification log table
      // Using a special eventId and userId to identify cleanup operations
      await prisma.notificationLog.create({
        data: {
          eventId: "cleanup-operation",
          userId: "system",
          notificationType: "maintenance",
          minutesBefore: stats.retentionDays * 24 * 60, // Convert retention days to minutes
          sentAt: new Date(),
          status: stats.error
            ? `cleanup_failed: ${stats.error}`
            : `cleanup_success: deleted_logs=${stats.deletedLogs}, deleted_notifications=${stats.deletedNotifications}, duration=${stats.cleanupDuration}ms`,
        },
      });

      // Log to console for immediate monitoring
      const logData = {
        operation: "notification_cleanup",
        timestamp: new Date().toISOString(),
        ...stats,
      };

      if (stats.error) {
        logger.error("📊 Cleanup statistics (FAILED):", logData);
      } else {
        logger.info("📊 Cleanup statistics (SUCCESS):", logData);
      }
    } catch (error) {
      logger.error(
        "Failed to log cleanup statistics:",
        errorMessage(error),
      );
      // Don't throw here as logging failure shouldn't break cleanup
    }
  }

  /**
   * Schedule automatic cleanup to run periodically
   * This method sets up a timer to run cleanup automatically
   * @param intervalHours - Hours between cleanup runs (default: 24)
   * @param retentionDays - Days to retain logs (default: 30)
   */
  public scheduleAutomaticCleanup(
    intervalHours: number = 24,
    retentionDays: number = 30,
  ): void {
    // Clear any existing cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    const intervalMs = intervalHours * MS_PER_HOUR;

    logger.info(
      `⏰ Scheduling automatic cleanup every ${intervalHours} hours with ${retentionDays} day retention`,
    );

    this.cleanupTimer = setInterval(async () => {
      try {
        logger.info("🕐 Running scheduled notification cleanup...");
        const result = await this.cleanupOldNotifications(retentionDays);

        logger.ok(
          `✅ Scheduled cleanup completed: ${result.deletedLogs} logs, ${result.deletedNotifications} notifications deleted in ${result.cleanupDuration}ms`,
        );
      } catch (error) {
        logger.error(
          "❌ Scheduled cleanup failed:",
          errorMessage(error),
        );
      }
    }, intervalMs);

    // Run initial cleanup after a short delay
    setTimeout(async () => {
      try {
        logger.info("🚀 Running initial notification cleanup...");
        await this.cleanupOldNotifications(retentionDays);
      } catch (error) {
        logger.error(
          "❌ Initial cleanup failed:",
          errorMessage(error),
        );
      }
    }, 30000); // 30 seconds delay
  }

  /**
   * Stop automatic cleanup scheduling
   */
  public stopAutomaticCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      logger.info("⏹️ Automatic cleanup scheduling stopped");
    }
  }

  /**
   * Get cleanup status and next scheduled run
   * @returns Cleanup scheduling information
   */
  public getCleanupStatus(): {
    isScheduled: boolean;
    nextRunEstimate?: Date;
    lastCleanupStats?: {
      timestamp: Date;
      deletedLogs: number;
      deletedNotifications: number;
      duration: number;
    };
  } {
    return {
      isScheduled: !!this.cleanupTimer,
      // Note: We can't get exact next run time from setInterval,
      // but we could track this if needed
      nextRunEstimate: this.cleanupTimer
        ? new Date(Date.now() + MS_PER_DAY) // Estimate based on 24h default
        : undefined,
      lastCleanupStats: this.lastCleanupStats,
    };
  }

  /**
   * Get detailed cleanup performance metrics for monitoring
   * @returns Comprehensive cleanup metrics and database statistics
   */
  public async getCleanupMetrics(): Promise<{
    currentDataSize: {
      notificationLogs: number;
      eventNotifications: number;
      oldestLogDate?: Date;
      oldestNotificationDate?: Date;
    };
    cleanupHistory: Array<{
      timestamp: Date;
      deletedLogs: number;
      deletedNotifications: number;
      duration: number;
      retentionDays: number;
    }>;
    recommendedActions: string[];
  }> {
    try {
      // Get current data sizes
      const [
        notificationLogCount,
        eventNotificationCount,
        oldestLog,
        oldestNotification,
        recentCleanupLogs,
      ] = await Promise.all([
        prisma.notificationLog.count(),
        prisma.eventNotification.count(),
        prisma.notificationLog.findFirst({
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        prisma.eventNotification.findFirst({
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        // Get recent cleanup operations from logs
        prisma.notificationLog.findMany({
          where: {
            eventId: "cleanup-operation",
            userId: "system",
            notificationType: "maintenance",
          },
          orderBy: { sentAt: "desc" },
          take: 10,
        }),
      ]);

      // Parse cleanup history from logs
      const cleanupHistory = recentCleanupLogs
        .map((log) => {
          try {
            // Parse the status field to extract cleanup metrics
            const statusMatch = log.status.match(
              /deleted_logs=(\d+), deleted_notifications=(\d+), duration=(\d+)ms/,
            );
            if (
              statusMatch &&
              statusMatch[1] &&
              statusMatch[2] &&
              statusMatch[3]
            ) {
              return {
                timestamp: log.sentAt,
                deletedLogs: parseInt(statusMatch[1]),
                deletedNotifications: parseInt(statusMatch[2]),
                duration: parseInt(statusMatch[3]),
                retentionDays: Math.floor(log.minutesBefore / (24 * 60)), // Convert back from minutes
              };
            }
            return null;
          } catch {
            return null;
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      // Generate recommendations based on data analysis
      const recommendedActions: string[] = [];

      if (notificationLogCount > 100000) {
        recommendedActions.push(
          "Consider reducing retention period - notification log table is large",
        );
      }

      if (eventNotificationCount > 50000) {
        recommendedActions.push(
          "High number of event notifications - consider cleanup of old sent notifications",
        );
      }

      const daysSinceOldestLog = oldestLog
        ? Math.floor(
            (Date.now() - oldestLog.createdAt.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      if (daysSinceOldestLog > 90) {
        recommendedActions.push(
          `Oldest logs are ${daysSinceOldestLog} days old - consider running cleanup`,
        );
      }

      if (cleanupHistory.length === 0) {
        recommendedActions.push(
          "No recent cleanup operations found - consider enabling automatic cleanup",
        );
      }

      if (recommendedActions.length === 0) {
        recommendedActions.push("Cleanup metrics look healthy");
      }

      return {
        currentDataSize: {
          notificationLogs: notificationLogCount,
          eventNotifications: eventNotificationCount,
          oldestLogDate: oldestLog?.createdAt,
          oldestNotificationDate: oldestNotification?.createdAt,
        },
        cleanupHistory,
        recommendedActions,
      };
    } catch (error) {
      logger.error("Failed to get cleanup metrics:", error);
      throw new Error(
        `Failed to retrieve cleanup metrics: ${
          errorMessage(error)
        }`,
      );
    }
  }

  /**
   * Get comprehensive notification statistics
   * @returns Detailed statistics about notification processing
   */
  public async getNotificationStatistics(): Promise<{
    totalPending: number;
    totalInRetryQueue: number;
    recentLogs: Array<{
      status: string;
      count: number;
      lastOccurrence: Date;
    }>;
    errorSummary: Array<{
      error: string;
      count: number;
      lastOccurrence: Date;
    }>;
  }> {
    try {
      // Get pending notifications count
      const totalPending = await prisma.eventNotification.count({
        where: {
          isEnabled: true,
          isSent: false,
          notificationTime: {
            gte: new Date(),
          },
        },
      });

      // Get recent notification logs (last 24 hours)
      const oneDayAgo = new Date(Date.now() - MS_PER_DAY);
      const recentLogs = await prisma.notificationLog.groupBy({
        by: ["status"],
        where: {
          createdAt: {
            gte: oneDayAgo,
          },
        },
        _count: {
          status: true,
        },
        _max: {
          createdAt: true,
        },
      });

      // Summarize errors from in-memory error log
      const errorSummary = new Map<
        string,
        { count: number; lastOccurrence: Date }
      >();
      for (const error of this.errors) {
        const existing = errorSummary.get(error.error);
        if (existing) {
          existing.count++;
          if (error.timestamp > existing.lastOccurrence) {
            existing.lastOccurrence = error.timestamp;
          }
        } else {
          errorSummary.set(error.error, {
            count: 1,
            lastOccurrence: error.timestamp,
          });
        }
      }

      return {
        totalPending,
        totalInRetryQueue: this.retryQueue.size,
        recentLogs: recentLogs.map((log) => ({
          status: log.status,
          count: log._count.status,
          lastOccurrence: log._max.createdAt || new Date(),
        })),
        errorSummary: Array.from(errorSummary.entries()).map(
          ([error, info]) => ({
            error,
            count: info.count,
            lastOccurrence: info.lastOccurrence,
          }),
        ),
      };
    } catch (error) {
      logger.error("Failed to get notification statistics:", error);
      throw error;
    }
  }

  /**
   * Get notifications for a specific event
   * @param eventId - The event ID
   * @returns Array of notifications for the event
   */
  public async getNotificationsForEvent(
    eventId: string,
  ): Promise<EventNotification[]> {
    try {
      const notifications = await prisma.eventNotification.findMany({
        where: { eventId },
        orderBy: { minutesBefore: "asc" },
      });

      return notifications;
    } catch (error) {
      logger.error("Failed to get notifications for event:", error);
      throw error;
    }
  }

  /**
   * Validate notification configurations
   * @param eventStart - The event start time
   * @param notifications - Array of notification configurations to validate
   * @returns Validation results
   */
  public validateNotificationConfigs(
    eventStart: Date,
    notifications: NotificationConfig[],
  ): Array<{ config: NotificationConfig; isValid: boolean; error?: string }> {
    return notifications.map((config) => {
      try {
        const result =
          NotificationCalculator.calculateNotificationTimeWithValidation(
            eventStart,
            config.minutesBefore,
          );

        return {
          config,
          isValid: result.isValid,
          error: result.error,
        };
      } catch (error) {
        return {
          config,
          isValid: false,
          error: errorMessage(error),
        };
      }
    });
  }

  /**
   * Create notifications for a recurring event series
   * This method generates notifications for each occurrence within a time window
   */
  public async createNotificationsForRecurringEvent(
    eventId: string,
    notifications: NotificationConfig[],
    startDate: Date,
    endDate: Date,
  ): Promise<CreateNotificationResult> {
    try {
      // Get the recurring event
      const recurringEvent = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          userId: true,
          start: true,
          end: true,
          recurrence: true,
        },
      });

      if (!recurringEvent) {
        throw new Error(`Recurring event with ID ${eventId} not found`);
      }

      if (!recurringEvent.recurrence) {
        // Not a recurring event, use regular notification creation
        return this.createNotificationsForEvent(
          eventId,
          recurringEvent.start,
          notifications,
        );
      }

      // Parse recurrence rule and generate instances
      const { RecurrenceEngine } = await import("./recurrence");

      try {
        const instances = RecurrenceEngine.generateInstances(
          {
            id: eventId,
            start: recurringEvent.start,
            end: recurringEvent.end,
            recurrence: recurringEvent.recurrence,
          },
          startDate,
          endDate,
        );

        const allCreated: EventNotification[] = [];
        const allSkipped: Array<{
          config: NotificationConfig;
          reason: string;
        }> = [];

        // Create notifications for each occurrence
        for (const instance of instances) {
          if (!instance.isOriginal) {
            // For recurring instances, create notifications with the occurrence date
            const result = await this.createNotificationsForEvent(
              eventId,
              instance.date,
              notifications,
            );

            allCreated.push(...result.created);
            allSkipped.push(...result.skipped);
          }
        }

        logger.ok(
          `✓ Created ${allCreated.length} notifications for ${instances.length} occurrences of recurring event ${eventId}`,
        );

        return {
          created: allCreated,
          skipped: allSkipped,
        };
      } catch (parseError) {
        logger.error("Failed to parse recurrence rule:", parseError);
        // Fall back to single event notification
        return this.createNotificationsForEvent(
          eventId,
          recurringEvent.start,
          notifications,
        );
      }
    } catch (error) {
      logger.error(
        "Failed to create notifications for recurring event:",
        error,
      );
      throw error;
    }
  }
}

// Export singleton instance
export const enhancedNotificationService =
  EnhancedNotificationService.getInstance();
