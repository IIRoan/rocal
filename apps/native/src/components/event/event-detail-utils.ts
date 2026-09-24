import { format } from "date-fns";
import {
  formatClockTimeRange,
  formatEventCalendarDate,
  resolveTimezone,
} from "@workspace/calendar-core";
import type {
  CalendarEvent,
  RecurrenceRule,
  TimeFormat,
} from "@workspace/calendar-core";
import { parseRRule, type ParsedRule } from "./recurrence-picker-utils";

/**
 * Format the date portion of an event for display on the detail screen.
 */
export function formatEventDate(
  event: CalendarEvent,
  timezone?: string,
): string {
  return formatEventCalendarDate(event, timezone);
}

/**
 * Format the time portion of an event for display on the detail screen.
 */
export function formatEventTime(
  event: CalendarEvent,
  timezone: string | undefined,
  timeFormat: TimeFormat,
): string {
  if (event.allDay) return "All day";
  return formatClockTimeRange(
    new Date(event.start),
    new Date(event.end),
    resolveTimezone(timezone ?? event.timezone),
    timeFormat,
  );
}

const WEEKDAY_SUMMARY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseJsonRecurrence(raw: string): ParsedRule | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const frequency = String(record.frequency ?? "").toLowerCase();
  if (
    frequency !== "daily" &&
    frequency !== "weekly" &&
    frequency !== "monthly" &&
    frequency !== "yearly"
  ) {
    return null;
  }

  const rawDays = record.byWeekDay ?? record.byDay;
  const byDay: number[] = [];
  if (Array.isArray(rawDays)) {
    for (const day of rawDays) {
      const value = Number(day);
      if (value >= 0 && value <= 6) {
        byDay.push(value);
      }
    }
  }

  let endCondition: ParsedRule["endCondition"] = "never";
  let count = 10;
  let until = "";

  if (record.count != null && record.count !== "") {
    endCondition = "count";
    count = Number(record.count) || 10;
  } else if (record.until) {
    endCondition = "until";
    until = String(record.until);
  }

  return {
    frequency,
    interval: Number(record.interval) || 1,
    byDay,
    endCondition,
    count,
    until,
  };
}

function formatUntilDate(until: string): string | null {
  const compact = until.trim().replace(/-/g, "");
  const dayStamp = compact.match(/^(\d{4})(\d{2})(\d{2})/);
  if (dayStamp) {
    const date = new Date(
      Number(dayStamp[1]),
      Number(dayStamp[2]) - 1,
      Number(dayStamp[3]),
    );
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return format(date, "MMM d, yyyy");
  }

  const parsed = new Date(until);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return format(parsed, "MMM d, yyyy");
}

function summarizeRecurrence(rule: ParsedRule): string {
  let description =
    rule.interval === 1
      ? rule.frequency.charAt(0).toUpperCase() + rule.frequency.slice(1)
      : `Every ${rule.interval} ${rule.frequency === "daily"
        ? "days"
        : rule.frequency === "weekly"
          ? "weeks"
          : rule.frequency === "monthly"
            ? "months"
            : "years"
      }`;

  if (rule.frequency === "weekly" && rule.byDay.length > 0) {
    const dayNames: string[] = [];
    for (const day of [...rule.byDay].sort((left, right) => left - right)) {
      const name = WEEKDAY_SUMMARY[day];
      if (name) {
        dayNames.push(name);
      }
    }
    if (dayNames.length > 0) {
      description += ` on ${dayNames.join(", ")}`;
    }
  }

  if (rule.endCondition === "count" && rule.count > 0) {
    description += `, ${rule.count} times`;
  } else if (rule.endCondition === "until" && rule.until) {
    const untilLabel = formatUntilDate(rule.until);
    if (untilLabel) {
      description += `, until ${untilLabel}`;
    }
  }

  return description;
}

export function summarizeRecurrenceRule(rule: RecurrenceRule): string {
  return summarizeRecurrence({
    frequency: rule.frequency,
    interval: rule.interval,
    byDay: rule.byWeekDay ?? [],
    endCondition: rule.count ? "count" : rule.until ? "until" : "never",
    count: rule.count ?? 0,
    until: rule.until ? new Date(rule.until).toISOString() : "",
  });
}

/**
 * Turn a stored recurrence payload (RRULE or JSON rule) into view copy.
 */
export function formatRecurrenceLabel(
  recurrence: string | null | undefined,
): string | null {
  const trimmed = recurrence?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = trimmed.startsWith("{")
    ? parseJsonRecurrence(trimmed)
    : parseRRule(trimmed);

  if (!parsed) {
    return "Repeats";
  }

  return summarizeRecurrence(parsed);
}
