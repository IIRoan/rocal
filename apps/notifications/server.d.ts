/**
 * Standalone Notification Server
 *
 * Processes scheduled notifications independently from the main backend.
 * Checks the database for notifications that need sending and sends them using Resend API.
 */
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
declare class NotificationServer {
    private isRunning;
    private backgroundTimer?;
    private alignmentTimer?;
    private processedCount;
    private failedCount;
    private errors;
    private lastProcessedAt?;
    private resend;
    private retryQueue;
    private cleanupTimer?;
    constructor();
    /**
     * Start the notification server
     */
    start(): void;
    /**
     * Stop the notification server
     */
    stop(): void;
    /**
     * Graceful shutdown
     */
    private shutdown;
    /**
     * Process scheduled notifications
     */
    processScheduledNotifications(): Promise<void>;
    /**
     * Send notification with retry logic
     */
    private sendNotificationWithRetry;
    /**
     * Send notification (email or browser)
     */
    private sendNotification;
    /**
     * Send email notification using Resend
     */
    private sendEmailNotification;
    /**
     * Generate email content
     */
    private generateEmailContent;
    /**
     * Render email template
     */
    private renderEmailTemplate;
    /**
     * Generate plain text email
     */
    private generatePlainTextEmail;
    /**
     * Format event details for email
     */
    private formatEventDetailsForEmail;
    /**
     * Format time with user preference
     */
    private formatTimeWithPreference;
    /**
     * Calculate event duration
     */
    private calculateEventDuration;
    /**
     * Format reminder text
     */
    private formatReminderText;
    /**
     * Generate email subject
     */
    private generateEmailSubject;
    /**
     * Send email with retry logic
     */
    private sendEmailWithRetryLogic;
    /**
     * Send browser notification (placeholder)
     */
    private sendBrowserNotification;
    /**
     * Mark notification as sent
     */
    private markNotificationAsSent;
    /**
     * Log notification
     */
    private logNotification;
    /**
     * Handle notification failure
     */
    private handleNotificationFailure;
    /**
     * Process retry queue
     */
    private processRetryQueue;
    /**
     * Handle event moved to past
     */
    private handleEventMovedToPast;
    /**
     * Should retry error
     */
    private shouldRetryError;
    /**
     * Calculate retry delay
     */
    private calculateRetryDelay;
    /**
     * Execute with database retry
     */
    private executeWithDatabaseRetry;
    /**
     * Check if database error is retryable
     */
    private isRetryableDatabaseError;
    /**
     * Perform initial health check
     */
    private performInitialHealthCheck;
    /**
     * Log service startup
     */
    private logServiceStartup;
    /**
     * Log processing metrics
     */
    private logProcessingMetrics;
    /**
     * Schedule automatic cleanup
     */
    private scheduleAutomaticCleanup;
    /**
     * Cleanup old notifications
     */
    private cleanupOldNotifications;
    /**
     * Enhance email error
     */
    private enhanceEmailError;
    /**
     * Validate email address
     */
    private isValidEmail;
    /**
     * Get from address
     */
    private getFromAddress;
    /**
     * Get notification status
     */
    getStatus(): NotificationStatus;
    /**
     * Health check endpoint
     */
    healthCheck(): Promise<{
        status: string;
        timestamp: Date;
        database: boolean;
        emailService: boolean;
        isRunning: boolean;
        uptime?: number;
    }>;
    /**
     * Get next retry time
     */
    private getNextRetryTime;
}
export { NotificationServer };
//# sourceMappingURL=server.d.ts.map