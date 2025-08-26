/**
 * Enhanced Notification Service
 *
 * Provides precise, time-based event notifications with lifecycle management.
 * Calculates exact notification times when reminders are created and manages
 * the complete notification lifecycle.
 */
import { type NotificationConfig } from "./notification-calculator";
import type { EventNotification } from "../generated/prisma";
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
export declare class EnhancedNotificationService {
    private static instance;
    private isRunning;
    private backgroundTimer?;
    private alignmentTimer?;
    private processedCount;
    private failedCount;
    private errors;
    private lastProcessedAt?;
    private resend;
    private retryQueue;
    private updateLocks?;
    private templateCache?;
    private cleanupTimer?;
    private lastCleanupStats?;
    private constructor();
    static getInstance(): EnhancedNotificationService;
    /**
     * Start the notification service lifecycle with enhanced error handling
     * Initializes background processing timer with comprehensive error handling and recovery
     * @param options - Optional configuration for service startup
     */
    start(options?: {
        enableAutomaticCleanup?: boolean;
        cleanupIntervalHours?: number;
        cleanupRetentionDays?: number;
        enableDatabaseHealthCheck?: boolean;
    }): void;
    /**
     * Perform initial database health check
     */
    private performInitialHealthCheck;
    /**
     * Log critical system errors for monitoring
     * @param error - The critical error
     */
    private logCriticalSystemError;
    /**
     * Log service startup for monitoring
     */
    private logServiceStartup;
    /**
     * Stop the notification service lifecycle
     * Clears background processing timer, cleanup timer, and logs final statistics
     */
    stop(): void;
    /**
     * Create notifications for an event with exact time calculation and enhanced error handling
     * @param eventId - The event ID
     * @param eventStart - The event start time
     * @param notifications - Array of notification configurations
     * @returns Result with created notifications and any skipped ones
     */
    createNotificationsForEvent(eventId: string, eventStart: Date, notifications: NotificationConfig[]): Promise<CreateNotificationResult>;
    /**
     * Update notifications for an event with proper cleanup and concurrent update handling
     * Replaces all existing notifications with new configuration
     * @param eventId - The event ID
     * @param eventStart - The event start time
     * @param notifications - Array of new notification configurations
     * @returns Result with created notifications and any skipped ones
     */
    updateNotificationsForEvent(eventId: string, eventStart: Date, notifications: NotificationConfig[]): Promise<CreateNotificationResult>;
    /**
     * Internal method for updating notifications with database connection handling
     * @param eventId - The event ID
     * @param eventStart - The event start time
     * @param notifications - Array of new notification configurations
     * @param attempt - Current attempt number for logging
     * @returns Result with created notifications and any skipped ones
     */
    private updateNotificationsForEventWithRetry;
    /**
     * Delete all notifications for an event with enhanced error handling
     * @param eventId - The event ID
     * @returns Number of deleted notifications
     */
    deleteNotificationsForEvent(eventId: string): Promise<number>;
    /**
     * Handle events moved to past dates by cleaning up future notifications
     * Implements Requirement 7.1
     * @param eventId - The event ID
     * @param eventStart - The new event start time (in the past)
     * @returns Number of cleaned up notifications
     */
    handleEventMovedToPast(eventId: string, eventStart: Date): Promise<number>;
    /**
     * Process scheduled notifications (background processing method)
     * Queries for notifications due in the current minute and sends them
     * Enhanced with database connection handling and improved error recovery
     */
    processScheduledNotifications(): Promise<void>;
    /**
     * Get current notification system status
     * @returns Current status including pending notifications and processing stats
     */
    getNotificationStatus(): Promise<NotificationStatus>;
    /**
     * Send a notification with retry logic
     * @param notification - The notification to send with included event and user data
     * @returns Result indicating success/failure and retry information
     */
    private sendNotificationWithRetry;
    /**
     * Handle notification failure and manage retry logic
     * @param notification - The failed notification
     * @param result - The delivery result with error information
     */
    private handleNotificationFailure;
    /**
     * Process notifications in the retry queue with enhanced error handling
     */
    private processRetryQueueWithErrorHandling;
    /**
     * Log processing metrics for monitoring
     * @param processed - Number of notifications processed successfully
     * @param failed - Number of notifications that failed
     * @param skipped - Number of notifications skipped
     */
    private logProcessingMetrics;
    /**
     * Log permanent notification failure
     * @param notificationId - The notification ID
     * @param retryInfo - Retry information
     */
    private logNotificationPermanentFailure;
    /**
     * Determine if an error should trigger a retry
     * @param error - The error that occurred
     * @returns Whether the error is retryable
     */
    private shouldRetryError;
    /**
     * Calculate retry delay based on error type and retry count
     * @param error - The error that occurred
     * @returns Delay in minutes before next retry
     */
    private calculateRetryDelay;
    /**
     * Send a single notification
     * @param notification - The notification to send with included event and user data
     */
    private sendNotification;
    /**
     * Send email notification using Resend with enhanced error handling and user preferences
     * @param event - The calendar event
     * @param user - The user to send to
     * @param minutesBefore - Minutes before the event
     */
    private sendEmailNotification;
    /**
     * Generate enhanced email content with better formatting and performance optimization
     * @param event - The calendar event
     * @param user - The user receiving the email
     * @param minutesBefore - Minutes before the event
     * @returns Enhanced email content with HTML and text versions
     */
    private generateEnhancedEmailContent;
    /**
     * Format event details for email with user preferences
     * @param event - The calendar event
     * @param timeFormat - User's preferred time format (12h/24h)
     * @param timezone - User's timezone
     * @param minutesBefore - Minutes before the event
     * @returns Formatted event details
     */
    private formatEventDetailsForEmail;
    /**
     * Render email template with caching for performance optimization
     * @param event - The calendar event
     * @param user - The user receiving the email
     * @param formattedDetails - Pre-formatted event details
     * @param userTheme - User's theme preference
     * @returns Rendered HTML email
     */
    private renderEmailTemplateWithCaching;
    /**
     * Generate plain text version of email for better deliverability
     * @param event - The calendar event
     * @param formattedDetails - Pre-formatted event details
     * @returns Plain text email content
     */
    private generatePlainTextEmail;
    /**
     * Generate email subject with context
     * @param event - The calendar event
     * @param minutesBefore - Minutes before the event
     * @returns Email subject line
     */
    private generateEmailSubject;
    /**
     * Send email with enhanced retry logic and error handling
     * @param emailData - Email data to send
     * @returns Resend API response
     */
    private sendEmailWithRetryLogic;
    /**
     * Enhance email errors with more context and categorization
     * @param error - Original error
     * @param user - User context
     * @param event - Event context
     * @returns Enhanced error with better categorization
     */
    private enhanceEmailError;
    /**
     * Execute database operation with retry logic for connection issues
     * Implements Requirement 7.4 - graceful handling of database connection issues
     * @param operation - Database operation to execute
     * @param maxRetries - Maximum number of retry attempts
     * @returns Result of the database operation
     */
    private executeWithDatabaseRetry;
    /**
     * Check if a database error is retryable
     * @param error - The error to check
     * @returns Whether the error should trigger a retry
     */
    private isRetryableDatabaseError;
    /**
     * Check if an update error is retryable (for concurrent update handling)
     * @param error - The error to check
     * @returns Whether the error should trigger a retry
     */
    private isRetryableUpdateError;
    /**
     * Handle concurrent notification updates with proper locking
     * Implements Requirement 7.6 - handle concurrent notification updates properly
     * @param eventId - The event ID
     * @param updateOperation - The update operation to perform
     * @returns Result of the update operation
     */
    handleConcurrentNotificationUpdate<T>(eventId: string, updateOperation: () => Promise<T>): Promise<T>;
    /**
     * Batch update notifications for multiple events (for efficiency)
     * @param updates - Array of event updates
     * @returns Results of all updates
     */
    batchUpdateNotifications(updates: Array<{
        eventId: string;
        eventStart: Date;
        notifications: NotificationConfig[];
    }>): Promise<Array<CreateNotificationResult & {
        eventId: string;
    }>>;
    /**
     * Clean up notifications for events that no longer exist (orphaned notifications)
     * @returns Number of cleaned up notifications
     */
    cleanupOrphanedNotifications(): Promise<number>;
    /**
     * Validate email address format
     * @param email - Email to validate
     * @returns Whether email is valid
     */
    private isValidEmail;
    /**
     * Get configured from address
     * @returns From email address
     */
    private getFromAddress;
    /**
     * Format time until event with enhanced precision
     * @param eventStart - Event start time
     * @returns Enhanced formatted time string
     */
    private formatTimeUntilEventEnhanced;
    /**
     * Format date with timezone consideration
     * @param date - Date to format
     * @param timezone - User's timezone
     * @returns Formatted date string
     */
    private formatDateWithTimezone;
    /**
     * Format time with user preference
     * @param date - Date to format
     * @param timeFormat - User's time format preference
     * @param timezone - User's timezone
     * @returns Formatted time string
     */
    private formatTimeWithPreference;
    /**
     * Calculate event duration
     * @param start - Event start time
     * @param end - Event end time
     * @returns Formatted duration string
     */
    private calculateEventDuration;
    /**
     * Sanitize description for email
     * @param description - Raw description
     * @returns Sanitized description
     */
    private sanitizeDescription;
    /**
     * Format reminder text
     * @param minutesBefore - Minutes before event
     * @returns Formatted reminder text
     */
    private formatReminderText;
    /**
     * Generate cache key for template rendering
     * @param event - Calendar event
     * @param user - User
     * @param formattedDetails - Formatted details
     * @param userTheme - User theme
     * @returns Cache key string
     */
    private generateTemplateCacheKey;
    /**
     * Log email delivery metrics for monitoring
     * @param userId - User ID
     * @param eventId - Event ID
     * @param status - Delivery status
     * @param resendId - Resend message ID
     * @param errorMessage - Error message if failed
     */
    private logEmailDeliveryMetrics;
    /**
     * Send browser notification (placeholder for now)
     * @param event - The calendar event
     * @param user - The user to send to
     * @param minutesBefore - Minutes before the event
     */
    private sendBrowserNotification;
    /**
     * Mark notification as sent in the database
     * @param notificationId - The notification ID
     * @param status - The status (sent, skipped, etc.)
     */
    private markNotificationAsSent;
    /**
     * Log notification to database with comprehensive status tracking
     * @param eventId - The event ID
     * @param userId - The user ID
     * @param notificationType - The notification type
     * @param minutesBefore - Minutes before the event
     * @param status - The status (sent, failed, skipped, retry_scheduled, processing)
     * @param errorMessage - Optional error message for failed notifications
     */
    private logNotification;
    /**
     * Format time until event for display
     * @param eventStart - The event start time
     * @returns Formatted time string
     */
    private formatTimeUntilEvent;
    /**
     * Get detailed retry queue information for monitoring
     * @returns Array of retry information for all queued notifications
     */
    getRetryQueueInfo(): NotificationRetryInfo[];
    /**
     * Clear retry queue (for testing or emergency situations)
     * @returns Number of retries cleared
     */
    clearRetryQueue(): number;
    /**
     * Clean up old notification logs and maintenance tasks
     * Implements automatic cleanup process with configurable retention period
     * @param retentionDays - Number of days to retain logs (default: 30)
     * @returns Cleanup statistics and performance metrics
     */
    cleanupOldNotifications(retentionDays?: number): Promise<{
        deletedLogs: number;
        deletedNotifications: number;
        cleanupDuration: number;
        retentionCutoff: Date;
        maintenanceResults: {
            vacuumedTables: string[];
            reindexedTables: string[];
            analyzedTables: string[];
        };
    }>;
    /**
     * Perform database maintenance tasks for notification tables
     * @returns Results of maintenance operations
     */
    private performDatabaseMaintenance;
    /**
     * Determine if reindexing should be performed
     * @returns Whether reindexing is recommended
     */
    private shouldPerformReindexing;
    /**
     * Determine if vacuum should be performed
     * @returns Whether vacuum is recommended
     */
    private shouldPerformVacuum;
    /**
     * Log cleanup statistics for monitoring and performance tracking
     * @param stats - Cleanup statistics to log
     */
    private logCleanupStatistics;
    /**
     * Schedule automatic cleanup to run periodically
     * This method sets up a timer to run cleanup automatically
     * @param intervalHours - Hours between cleanup runs (default: 24)
     * @param retentionDays - Days to retain logs (default: 30)
     */
    scheduleAutomaticCleanup(intervalHours?: number, retentionDays?: number): void;
    /**
     * Stop automatic cleanup scheduling
     */
    stopAutomaticCleanup(): void;
    /**
     * Get cleanup status and next scheduled run
     * @returns Cleanup scheduling information
     */
    getCleanupStatus(): {
        isScheduled: boolean;
        nextRunEstimate?: Date;
        lastCleanupStats?: {
            timestamp: Date;
            deletedLogs: number;
            deletedNotifications: number;
            duration: number;
        };
    };
    /**
     * Get detailed cleanup performance metrics for monitoring
     * @returns Comprehensive cleanup metrics and database statistics
     */
    getCleanupMetrics(): Promise<{
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
    }>;
    /**
     * Get comprehensive notification statistics
     * @returns Detailed statistics about notification processing
     */
    getNotificationStatistics(): Promise<{
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
    }>;
    /**
     * Get notifications for a specific event
     * @param eventId - The event ID
     * @returns Array of notifications for the event
     */
    getNotificationsForEvent(eventId: string): Promise<EventNotification[]>;
    /**
     * Validate notification configurations
     * @param eventStart - The event start time
     * @param notifications - Array of notification configurations to validate
     * @returns Validation results
     */
    validateNotificationConfigs(eventStart: Date, notifications: NotificationConfig[]): Array<{
        config: NotificationConfig;
        isValid: boolean;
        error?: string;
    }>;
    /**
     * Create notifications for a recurring event series
     * This method generates notifications for each occurrence within a time window
     */
    createNotificationsForRecurringEvent(eventId: string, notifications: NotificationConfig[], startDate: Date, endDate: Date): Promise<CreateNotificationResult>;
}
export declare const enhancedNotificationService: EnhancedNotificationService;
//# sourceMappingURL=enhanced-notification-service.d.ts.map