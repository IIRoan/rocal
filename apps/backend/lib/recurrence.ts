import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  isSameDay,
  startOfDay,
} from "date-fns";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number; // Every X days/weeks/months/years
  count?: number; // Number of occurrences (optional)
  until?: Date; // End date (optional)
  byWeekDay?: number[]; // Days of the week (0=Sunday, 1=Monday, etc.) - for weekly
  byMonthDay?: number[]; // Days of the month (1-31) - for monthly
  byMonth?: number[]; // Months (1-12) - for yearly
}

export interface RecurrenceInstance {
  date: Date;
  isOriginal: boolean;
  originalEventId: string;
  instanceId?: string; // For modified instances
}

export class RecurrenceEngine {
  /**
   * Parse a JSON recurrence string into a RecurrenceRule object
   */
  static parseRecurrenceRule(recurrenceJson: string): RecurrenceRule | null {
    try {
      const rule = JSON.parse(recurrenceJson);

      // Validate required fields
      if (!rule.frequency || !rule.interval) {
        return null;
      }

      // Validate frequency
      if (!["daily", "weekly", "monthly", "yearly"].includes(rule.frequency)) {
        return null;
      }

      // Validate interval
      if (typeof rule.interval !== "number" || rule.interval < 1) {
        return null;
      }

      // Parse dates if they exist
      if (rule.until) {
        rule.until = new Date(rule.until);
      }

      return rule as RecurrenceRule;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create a recurrence rule JSON string
   */
  static createRecurrenceRule(rule: RecurrenceRule): string {
    return JSON.stringify(rule);
  }

  /**
   * Generate recurring instances for a given date range
   */
  static generateInstances(
    baseEvent: {
      id: string;
      start: Date;
      end: Date;
      recurrence: string;
    },
    rangeStart: Date,
    rangeEnd: Date,
    exceptions: Array<{
      exceptionDate: Date;
      type: "modified" | "deleted";
    }> = [],
  ): RecurrenceInstance[] {
    const rule = this.parseRecurrenceRule(baseEvent.recurrence);
    if (!rule) return [];



    const instances: RecurrenceInstance[] = [];
    const eventStart = baseEvent.start;
    const eventDuration = baseEvent.end.getTime() - baseEvent.start.getTime();

    let currentDate = new Date(eventStart);
    let count = 0;
    const maxIterations = 1000; // Safety limit

    // Add the original event if it falls within range
    if (currentDate >= rangeStart && currentDate <= rangeEnd) {
      const isDeleted = exceptions.some((ex) =>
        isSameDay(ex.exceptionDate, currentDate) && ex.type === "deleted",
      );
      if (isDeleted) {

      } else {
        instances.push({
          date: new Date(currentDate),
          isOriginal: true,
          originalEventId: baseEvent.id,
        });
      }
    }

    // Generate recurring instances
    while (count < maxIterations) {
      currentDate = this.getNextOccurrence(currentDate, rule);
      count++;

      // Check end conditions
      if (rule.count && instances.length >= rule.count) break;
      if (rule.until && currentDate > rule.until) break;
      if (currentDate > rangeEnd) break;

      // Check if this instance falls within our range
      if (currentDate >= rangeStart && currentDate <= rangeEnd) {
        const isDeleted = exceptions.some((ex) =>
          isSameDay(ex.exceptionDate, currentDate) && ex.type === "deleted",
        );
        if (isDeleted) {

        } else {
          instances.push({
            date: new Date(currentDate),
            isOriginal: false,
            originalEventId: baseEvent.id,
          });
        }
      }
    }


    return instances;
  }

  /**
   * Get the next occurrence based on recurrence rule
   */
  private static getNextOccurrence(
    currentDate: Date,
    rule: RecurrenceRule,
  ): Date {
    switch (rule.frequency) {
      case "daily":
        if (rule.byWeekDay && rule.byWeekDay.length > 0) {
          // Daily with specific weekdays (e.g., weekdays only)
          let nextDate = addDays(currentDate, 1);
          const maxDays = 14; // Look ahead up to 2 weeks
          let daysChecked = 0;

          while (daysChecked < maxDays) {
            if (rule.byWeekDay.includes(nextDate.getDay())) {
              return nextDate;
            }
            nextDate = addDays(nextDate, 1);
            daysChecked++;
          }
          
          // Fallback to regular daily if no weekday found
          return addDays(currentDate, rule.interval);
        } else {
          return addDays(currentDate, rule.interval);
        }

      case "weekly":
        if (rule.byWeekDay && rule.byWeekDay.length > 0) {
          // Find next occurrence on specified weekdays
          let nextDate = addDays(currentDate, 1);
          const maxDays = rule.interval * 7; // Look within the next interval
          let daysChecked = 0;

          while (daysChecked < maxDays) {
            if (rule.byWeekDay.includes(nextDate.getDay())) {
              return nextDate;
            }
            nextDate = addDays(nextDate, 1);
            daysChecked++;
          }

          // If no matching weekday found in current interval, move to next interval
          return addWeeks(currentDate, rule.interval);
        } else {
          return addWeeks(currentDate, rule.interval);
        }

      case "monthly":
        if (rule.byMonthDay && rule.byMonthDay.length > 0) {
          // Handle specific days of the month
          let nextDate = addMonths(currentDate, rule.interval);
          const targetDay = rule.byMonthDay[0]; // Use first specified day for simplicity
          nextDate.setDate(Math.min(targetDay!, this.getDaysInMonth(nextDate)));
          return nextDate;
        } else {
          return addMonths(currentDate, rule.interval);
        }

      case "yearly":
        if (rule.byMonth && rule.byMonth.length > 0) {
          let nextDate = addYears(currentDate, rule.interval);
          nextDate.setMonth((rule.byMonth?.[0] ?? 1) - 1); // Month is 0-indexed
          if (rule.byMonthDay && rule.byMonthDay.length > 0) {
            nextDate.setDate(
              Math.min(rule.byMonthDay[0]!, this.getDaysInMonth(nextDate)),
            );
          }
          return nextDate;
        } else {
          return addYears(currentDate, rule.interval);
        }

      default:
        return currentDate;
    }
  }

  /**
   * Get number of days in a month
   */
  private static getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  /**
   * Validate a recurrence rule
   */
  static validateRecurrenceRule(rule: RecurrenceRule): string[] {
    const errors: string[] = [];

    if (!rule.frequency) {
      errors.push("Frequency is required");
    } else if (
      !["daily", "weekly", "monthly", "yearly"].includes(rule.frequency)
    ) {
      errors.push(
        "Invalid frequency. Must be daily, weekly, monthly, or yearly",
      );
    }

    if (!rule.interval) {
      errors.push("Interval is required");
    } else if (rule.interval < 1 || rule.interval > 999) {
      errors.push("Interval must be between 1 and 999");
    }

    if (rule.count && rule.count < 1) {
      errors.push("Count must be greater than 0");
    }

    if (rule.count && rule.until) {
      errors.push("Cannot specify both count and until date");
    }

    if (rule.byWeekDay) {
      if (rule.frequency !== "weekly" && rule.frequency !== "daily") {
        errors.push("byWeekDay can only be used with weekly or daily frequency");
      } else if (
        !Array.isArray(rule.byWeekDay) ||
        rule.byWeekDay.some((d) => d < 0 || d > 6)
      ) {
        errors.push(
          "byWeekDay must be an array of numbers 0-6 (Sunday-Saturday)",
        );
      }
    }

    if (rule.byMonthDay) {
      if (rule.frequency !== "monthly" && rule.frequency !== "yearly") {
        errors.push(
          "byMonthDay can only be used with monthly or yearly frequency",
        );
      } else if (
        !Array.isArray(rule.byMonthDay) ||
        rule.byMonthDay.some((d) => d < 1 || d > 31)
      ) {
        errors.push("byMonthDay must be an array of numbers 1-31");
      }
    }

    if (rule.byMonth) {
      if (rule.frequency !== "yearly") {
        errors.push("byMonth can only be used with yearly frequency");
      } else if (
        !Array.isArray(rule.byMonth) ||
        rule.byMonth.some((m) => m < 1 || m > 12)
      ) {
        errors.push("byMonth must be an array of numbers 1-12");
      }
    }

    return errors;
  }

  /**
   * Create a human-readable description of a recurrence rule
   */
  static getRecurrenceDescription(rule: RecurrenceRule): string {
    const { frequency, interval } = rule;

    let description = "";

    if (interval === 1) {
      switch (frequency) {
        case "daily":
          description = "Daily";
          break;
        case "weekly":
          description = "Weekly";
          break;
        case "monthly":
          description = "Monthly";
          break;
        case "yearly":
          description = "Yearly";
          break;
      }
    } else {
      switch (frequency) {
        case "daily":
          description = `Every ${interval} days`;
          break;
        case "weekly":
          description = `Every ${interval} weeks`;
          break;
        case "monthly":
          description = `Every ${interval} months`;
          break;
        case "yearly":
          description = `Every ${interval} years`;
          break;
      }
    }

    // Add weekday specification for weekly
    if (frequency === "weekly" && rule.byWeekDay && rule.byWeekDay.length > 0) {
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayNames = rule.byWeekDay.map((d) => weekdays[d]).join(", ");
      description += ` on ${dayNames}`;
    }

    // Add end condition
    if (rule.count) {
      description += `, ${rule.count} times`;
    } else if (rule.until) {
      description += `, until ${rule.until.toLocaleDateString()}`;
    }

    return description;
  }

  /**
   * Create common recurrence patterns
   */
  static createCommonPatterns() {
    return {
      daily: (): RecurrenceRule => ({
        frequency: "daily",
        interval: 1,
      }),

      weekly: (weekdays?: number[]): RecurrenceRule => ({
        frequency: "weekly",
        interval: 1,
        ...(weekdays && { byWeekDay: weekdays }),
      }),

      biweekly: (weekdays?: number[]): RecurrenceRule => ({
        frequency: "weekly",
        interval: 2,
        ...(weekdays && { byWeekDay: weekdays }),
      }),

      monthly: (dayOfMonth?: number): RecurrenceRule => ({
        frequency: "monthly",
        interval: 1,
        ...(dayOfMonth && { byMonthDay: [dayOfMonth] }),
      }),

      yearly: (month?: number, dayOfMonth?: number): RecurrenceRule => ({
        frequency: "yearly",
        interval: 1,
        ...(month && { byMonth: [month] }),
        ...(dayOfMonth && { byMonthDay: [dayOfMonth] }),
      }),

      weekdays: (): RecurrenceRule => ({
        frequency: "weekly",
        interval: 1,
        byWeekDay: [1, 2, 3, 4, 5], // Monday to Friday
      }),
    };
  }
}
