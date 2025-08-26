/**
 * Notification Calculator Utility
 *
 * Provides precise time calculation functions for event notifications.
 * Handles exact notification time calculations, validation, and date rounding.
 */
export interface NotificationConfig {
    notificationType: "email" | "browser";
    minutesBefore: number;
    isEnabled: boolean;
}
export interface NotificationTimeResult {
    notificationTime: Date;
    isValid: boolean;
    error?: string;
}
export declare class NotificationCalculator {
    /**
     * Calculate exact notification time based on event start time and minutes before
     * @param eventStart - The start time of the event
     * @param minutesBefore - Minutes before the event to send notification
     * @returns The exact notification time
     */
    static calculateNotificationTime(eventStart: Date, minutesBefore: number): Date;
    /**
     * Calculate notification time with validation
     * @param eventStart - The start time of the event
     * @param minutesBefore - Minutes before the event to send notification
     * @param currentTime - Current time for validation (defaults to now)
     * @returns Result object with notification time and validation status
     */
    static calculateNotificationTimeWithValidation(eventStart: Date, minutesBefore: number, currentTime?: Date): NotificationTimeResult;
    /**
     * Validate that notification time is in the future
     * @param notificationTime - The calculated notification time
     * @param currentTime - Current time for comparison (defaults to now)
     * @returns True if notification time is valid (in future)
     */
    static validateNotificationTime(notificationTime: Date, currentTime?: Date): boolean;
    /**
     * Round date to minute precision (remove seconds and milliseconds)
     * @param date - Date to round
     * @returns Date rounded to the nearest minute
     */
    static roundToMinute(date: Date): Date;
    /**
     * Calculate multiple notification times for an event
     * @param eventStart - The start time of the event
     * @param notificationConfigs - Array of notification configurations
     * @param currentTime - Current time for validation (defaults to now)
     * @returns Array of notification time results
     */
    static calculateMultipleNotificationTimes(eventStart: Date, notificationConfigs: NotificationConfig[], currentTime?: Date): Array<NotificationTimeResult & {
        config: NotificationConfig;
    }>;
    /**
     * Check if an event start time allows for valid notifications
     * @param eventStart - The start time of the event
     * @param currentTime - Current time for comparison (defaults to now)
     * @returns True if event is in the future
     */
    static isEventInFuture(eventStart: Date, currentTime?: Date): boolean;
    /**
     * Get the maximum valid minutes before for an event
     * @param eventStart - The start time of the event
     * @param currentTime - Current time for comparison (defaults to now)
     * @returns Maximum minutes before that would result in a future notification
     */
    static getMaxValidMinutesBefore(eventStart: Date, currentTime?: Date): number;
    /**
     * Format time difference for display purposes
     * @param notificationTime - The notification time
     * @param eventStart - The event start time
     * @returns Human-readable time difference string
     */
    static formatTimeDifference(notificationTime: Date, eventStart: Date): string;
}
//# sourceMappingURL=notification-calculator.d.ts.map