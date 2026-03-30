import { addDays, addMonths, addWeeks, addYears, isSameDay } from "date-fns";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  count?: number;
  until?: Date;
  timezone?: string;
  byWeekDay?: number[];
  byMonthDay?: number[];
  byMonth?: number[];
}

export interface RecurrenceInstance {
  date: Date;
  isOriginal: boolean;
  originalEventId: string;
  instanceId?: string;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  formatterCache.set(timezone, formatter);
  return formatter;
}

function parseDateParts(date: Date, timezone: string): DateParts {
  const parts = getFormatter(timezone).formatToParts(date);
  const byType: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};

  for (const part of parts) {
    if (part.type === "literal") {
      continue;
    }

    const parsed = Number.parseInt(part.value, 10);
    if (!Number.isNaN(parsed)) {
      byType[part.type] = parsed;
    }
  }

  return {
    year: byType.year ?? date.getUTCFullYear(),
    month: byType.month ?? date.getUTCMonth() + 1,
    day: byType.day ?? date.getUTCDate(),
    hour: byType.hour ?? date.getUTCHours(),
    minute: byType.minute ?? date.getUTCMinutes(),
    second: byType.second ?? date.getUTCSeconds(),
  };
}

function getUtcParts(date: Date): DateParts {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

function partsToTimestamp(parts: DateParts, milliseconds: number): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    milliseconds,
  );
}

export class RecurrenceEngine {
  static parseRecurrenceRule(recurrenceJson: string): RecurrenceRule | null {
    try {
      const rule = JSON.parse(recurrenceJson);

      if (!rule.frequency || !rule.interval) {
        return null;
      }

      if (!["daily", "weekly", "monthly", "yearly"].includes(rule.frequency)) {
        return null;
      }

      if (typeof rule.interval !== "number" || rule.interval < 1) {
        return null;
      }

      if (rule.until) {
        rule.until = new Date(rule.until);
      }

      if (rule.timezone && typeof rule.timezone !== "string") {
        return null;
      }

      return rule as RecurrenceRule;
    } catch {
      return null;
    }
  }

  static createRecurrenceRule(rule: RecurrenceRule): string {
    return JSON.stringify(rule);
  }

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
    const timezone = rule.timezone;

    let currentDate = this.toRuleContextDate(baseEvent.start, timezone);
    let iterations = 0;
    let occurrenceCount = 1;
    const maxIterations = 1000;
    let currentOccurrenceInstant = this.fromRuleContextDate(
      currentDate,
      timezone,
    );

    if (
      currentOccurrenceInstant >= rangeStart &&
      currentOccurrenceInstant <= rangeEnd
    ) {
      const isDeleted = exceptions.some(
        (ex) =>
          isSameDay(ex.exceptionDate, currentOccurrenceInstant) &&
          ex.type === "deleted",
      );
      if (!isDeleted) {
        instances.push({
          date: new Date(currentOccurrenceInstant),
          isOriginal: true,
          originalEventId: baseEvent.id,
        });
      }
    }

    while (iterations < maxIterations) {
      if (rule.count && occurrenceCount >= rule.count) break;

      currentDate = this.getNextOccurrence(currentDate, rule);
      iterations++;
      occurrenceCount++;

      currentOccurrenceInstant = this.fromRuleContextDate(
        currentDate,
        timezone,
      );

      if (rule.until && currentOccurrenceInstant > rule.until) break;
      if (currentOccurrenceInstant > rangeEnd) break;

      if (
        currentOccurrenceInstant >= rangeStart &&
        currentOccurrenceInstant <= rangeEnd
      ) {
        const isDeleted = exceptions.some(
          (ex) =>
            isSameDay(ex.exceptionDate, currentOccurrenceInstant) &&
            ex.type === "deleted",
        );
        if (!isDeleted) {
          instances.push({
            date: new Date(currentOccurrenceInstant),
            isOriginal: false,
            originalEventId: baseEvent.id,
          });
        }
      }
    }

    return instances;
  }

  private static toRuleContextDate(date: Date, timezone?: string): Date {
    if (!timezone) {
      return new Date(date);
    }

    const zonedParts = parseDateParts(date, timezone);
    return new Date(partsToTimestamp(zonedParts, date.getUTCMilliseconds()));
  }

  private static fromRuleContextDate(date: Date, timezone?: string): Date {
    if (!timezone) {
      return new Date(date);
    }

    const desired = getUtcParts(date);
    const milliseconds = date.getUTCMilliseconds();
    const targetTimestamp = partsToTimestamp(desired, milliseconds);
    let guess = new Date(targetTimestamp);

    for (let i = 0; i < 2; i++) {
      const actual = parseDateParts(guess, timezone);
      const actualTimestamp = partsToTimestamp(actual, milliseconds);
      const diff = targetTimestamp - actualTimestamp;

      if (diff === 0) {
        break;
      }

      guess = new Date(guess.getTime() + diff);
    }

    return guess;
  }

  private static getNextOccurrence(
    currentDate: Date,
    rule: RecurrenceRule,
  ): Date {
    switch (rule.frequency) {
      case "daily":
        if (rule.byWeekDay && rule.byWeekDay.length > 0) {
          let nextDate = addDays(currentDate, 1);
          const maxDays = 14;
          let daysChecked = 0;

          while (daysChecked < maxDays) {
            if (rule.byWeekDay.includes(nextDate.getDay())) {
              return nextDate;
            }
            nextDate = addDays(nextDate, 1);
            daysChecked++;
          }

          return addDays(currentDate, rule.interval);
        } else {
          return addDays(currentDate, rule.interval);
        }

      case "weekly":
        if (rule.byWeekDay && rule.byWeekDay.length > 0) {
          let nextDate = addDays(currentDate, 1);
          const maxDays = rule.interval * 7;
          let daysChecked = 0;

          while (daysChecked < maxDays) {
            if (rule.byWeekDay.includes(nextDate.getDay())) {
              return nextDate;
            }
            nextDate = addDays(nextDate, 1);
            daysChecked++;
          }

          return addWeeks(currentDate, rule.interval);
        } else {
          return addWeeks(currentDate, rule.interval);
        }

      case "monthly":
        if (rule.byMonthDay && rule.byMonthDay.length > 0) {
          const nextDate = addMonths(currentDate, rule.interval);
          const targetDay = rule.byMonthDay[0];
          nextDate.setDate(Math.min(targetDay!, this.getDaysInMonth(nextDate)));
          return nextDate;
        } else {
          return addMonths(currentDate, rule.interval);
        }

      case "yearly":
        if (rule.byMonth && rule.byMonth.length > 0) {
          const nextDate = addYears(currentDate, rule.interval);
          nextDate.setMonth((rule.byMonth?.[0] ?? 1) - 1);
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

  private static getDaysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

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

    if (rule.timezone && typeof rule.timezone !== "string") {
      errors.push("timezone must be a valid IANA timezone string");
    }

    if (rule.byWeekDay) {
      if (rule.frequency !== "weekly" && rule.frequency !== "daily") {
        errors.push(
          "byWeekDay can only be used with weekly or daily frequency",
        );
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

    if (frequency === "weekly" && rule.byWeekDay && rule.byWeekDay.length > 0) {
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayNames = rule.byWeekDay.map((d) => weekdays[d]).join(", ");
      description += ` on ${dayNames}`;
    }

    if (rule.count) {
      description += `, ${rule.count} times`;
    } else if (rule.until) {
      description += `, until ${rule.until.toLocaleDateString()}`;
    }

    return description;
  }

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
        byWeekDay: [1, 2, 3, 4, 5],
      }),
    };
  }
}
