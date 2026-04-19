import type { CalendarEvent } from "../generated/prisma/index.js";
import type { IcsBuildEventInput, IcsRecurrenceRule } from "@workspace/calendar-ics";
import { RecurrenceEngine } from "./recurrence";

function toIcsRecurrenceRule(
  recurrenceRaw?: string | null,
): IcsRecurrenceRule | undefined {
  if (!recurrenceRaw) {
    return undefined;
  }

  const parsed = RecurrenceEngine.parseRecurrenceRule(recurrenceRaw);
  if (!parsed) {
    return undefined;
  }

  return {
    frequency: parsed.frequency,
    interval: parsed.interval,
    count: parsed.count,
    until: parsed.until ? parsed.until.toISOString() : undefined,
    timezone: parsed.timezone,
    byWeekDay: parsed.byWeekDay,
    byMonthDay: parsed.byMonthDay,
    byMonth: parsed.byMonth,
  };
}

export function toIcsBuildEvent(event: CalendarEvent): IcsBuildEventInput {
  return {
    uid: event.externalId || `${event.id}@solace-calendar.local`,
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    timezone: event.timezone,
    location: event.location,
    recurrence: toIcsRecurrenceRule(event.recurrence),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function toSafeIcsFilename(baseName: string): string {
  const trimmed = baseName.trim() || "calendar";
  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  const finalName = normalized || "calendar";
  return finalName.endsWith(".ics") ? finalName : `${finalName}.ics`;
}
