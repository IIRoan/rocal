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

export class NotificationCalculator {
  /**
   * Calculate exact notification time based on event start time and minutes before
   * @param eventStart - The start time of the event
   * @param minutesBefore - Minutes before the event to send notification
   * @returns The exact notification time
   */
  static calculateNotificationTime(
    eventStart: Date,
    minutesBefore: number,
  ): Date {
    if (!eventStart || isNaN(eventStart.getTime())) {
      throw new Error("Invalid event start time");
    }

    if (!Number.isInteger(minutesBefore) || minutesBefore < 0) {
      throw new Error("Minutes before must be a non-negative integer");
    }

    // Calculate notification time by subtracting minutes from event start
    const notificationTime = new Date(
      eventStart.getTime() - minutesBefore * 60 * 1000,
    );

    // Round to minute precision to avoid second-level precision issues
    return this.roundToMinute(notificationTime);
  }

  /**
   * Calculate notification time with validation
   * @param eventStart - The start time of the event
   * @param minutesBefore - Minutes before the event to send notification
   * @param currentTime - Current time for validation (defaults to now)
   * @returns Result object with notification time and validation status
   */
  static calculateNotificationTimeWithValidation(
    eventStart: Date,
    minutesBefore: number,
    currentTime: Date = new Date(),
  ): NotificationTimeResult {
    try {
      const notificationTime = this.calculateNotificationTime(
        eventStart,
        minutesBefore,
      );
      const isValid = this.validateNotificationTime(
        notificationTime,
        currentTime,
      );

      if (!isValid) {
        return {
          notificationTime,
          isValid: false,
          error: "Notification time is in the past",
        };
      }

      return {
        notificationTime,
        isValid: true,
      };
    } catch (error) {
      return {
        notificationTime: new Date(),
        isValid: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate that notification time is in the future
   * @param notificationTime - The calculated notification time
   * @param currentTime - Current time for comparison (defaults to now)
   * @returns True if notification time is valid (in future)
   */
  static validateNotificationTime(
    notificationTime: Date,
    currentTime: Date = new Date(),
  ): boolean {
    if (!notificationTime || isNaN(notificationTime.getTime())) {
      return false;
    }

    if (!currentTime || isNaN(currentTime.getTime())) {
      return false;
    }

    // Round current time to minute precision for fair comparison
    const roundedCurrentTime = this.roundToMinute(currentTime);
    const roundedNotificationTime = this.roundToMinute(notificationTime);

    return roundedNotificationTime > roundedCurrentTime;
  }

  /**
   * Round date to minute precision (remove seconds and milliseconds)
   * @param date - Date to round
   * @returns Date rounded to the nearest minute
   */
  static roundToMinute(date: Date): Date {
    if (!date || isNaN(date.getTime())) {
      throw new Error("Invalid date provided");
    }

    const rounded = new Date(date);
    rounded.setSeconds(0, 0); // Set seconds and milliseconds to 0
    return rounded;
  }

  /**
   * Calculate multiple notification times for an event
   * @param eventStart - The start time of the event
   * @param notificationConfigs - Array of notification configurations
   * @param currentTime - Current time for validation (defaults to now)
   * @returns Array of notification time results
   */
  static calculateMultipleNotificationTimes(
    eventStart: Date,
    notificationConfigs: NotificationConfig[],
    currentTime: Date = new Date(),
  ): Array<NotificationTimeResult & { config: NotificationConfig }> {
    return notificationConfigs.map((config) => ({
      ...this.calculateNotificationTimeWithValidation(
        eventStart,
        config.minutesBefore,
        currentTime,
      ),
      config,
    }));
  }

  /**
   * Check if an event start time allows for valid notifications
   * @param eventStart - The start time of the event
   * @param currentTime - Current time for comparison (defaults to now)
   * @returns True if event is in the future
   */
  static isEventInFuture(
    eventStart: Date,
    currentTime: Date = new Date(),
  ): boolean {
    if (!eventStart || isNaN(eventStart.getTime())) {
      return false;
    }

    if (!currentTime || isNaN(currentTime.getTime())) {
      return false;
    }

    return eventStart > currentTime;
  }

  /**
   * Get the maximum valid minutes before for an event
   * @param eventStart - The start time of the event
   * @param currentTime - Current time for comparison (defaults to now)
   * @returns Maximum minutes before that would result in a future notification
   */
  static getMaxValidMinutesBefore(
    eventStart: Date,
    currentTime: Date = new Date(),
  ): number {
    if (!this.isEventInFuture(eventStart, currentTime)) {
      return 0;
    }

    const timeDiffMs = eventStart.getTime() - currentTime.getTime();
    const maxMinutes = Math.floor(timeDiffMs / (60 * 1000));

    // Subtract 1 minute to ensure the notification time is definitely in the future
    return Math.max(0, maxMinutes - 1);
  }

  /**
   * Format time difference for display purposes
   * @param notificationTime - The notification time
   * @param eventStart - The event start time
   * @returns Human-readable time difference string
   */
  static formatTimeDifference(
    notificationTime: Date,
    eventStart: Date,
  ): string {
    const diffMs = eventStart.getTime() - notificationTime.getTime();
    const diffMinutes = Math.floor(diffMs / (60 * 1000));

    if (diffMinutes === 0) {
      return "at event time";
    } else if (diffMinutes === 1) {
      return "1 minute before";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minutes before`;
    } else if (diffMinutes === 60) {
      return "1 hour before";
    } else if (diffMinutes < 1440) {
      const hours = Math.floor(diffMinutes / 60);
      const remainingMinutes = diffMinutes % 60;
      if (remainingMinutes === 0) {
        return `${hours} hour${hours > 1 ? "s" : ""} before`;
      } else {
        return `${hours}h ${remainingMinutes}m before`;
      }
    } else {
      const days = Math.floor(diffMinutes / 1440);
      const remainingHours = Math.floor((diffMinutes % 1440) / 60);
      if (remainingHours === 0) {
        return `${days} day${days > 1 ? "s" : ""} before`;
      } else {
        return `${days}d ${remainingHours}h before`;
      }
    }
  }
}
