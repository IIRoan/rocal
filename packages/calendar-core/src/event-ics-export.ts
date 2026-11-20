import {
  buildIcsCalendar,
  buildIcsEventFile,
  type IcsBuildEventInput,
  type IcsRecurrenceRule,
} from "@workspace/calendar-ics";
import { RecurrenceEngine } from "@workspace/calendar-ics/recurrence";
import { ENCRYPTED_CALENDAR_EXTERNAL_LABEL } from "./content-encryption";
import { isDecryptedEventReminderContent } from "./event-reminder-mail";
import { resolveTimezone } from "./timezone";
import type { CalendarEvent } from "./types";

const ICS_UID_DOMAIN = "solace-calendar.local";

export interface EventIcsExport {
  icsContent: string;
  filename: string;
}

export class EventIcsExportError extends Error {}

/** A calendar export leaves out events this device can't open, and says how many. */
export interface CalendarIcsExport extends EventIcsExport {
  skipped: number;
}

export function calendarIcsExportSkippedNotice(skipped: number): string {
  return skipped === 1
    ? "1 event couldn't be opened on this device, so it was left out of the export."
    : `${skipped} events couldn't be opened on this device, so they were left out of the export.`;
}

/** Same rules as the backend export, so web and native downloads get the same file name. */
export function toSafeIcsFilename(baseName: string): string {
  const normalized = (baseName.trim() || "calendar")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  const finalName = normalized || "calendar";
  return finalName.endsWith(".ics") ? finalName : `${finalName}.ics`;
}

function toIcsRecurrenceRule(raw?: string | null): IcsRecurrenceRule | undefined {
  const parsed = raw ? RecurrenceEngine.parseRecurrenceRule(raw) : null;
  if (!parsed) return undefined;
  return {
    frequency: parsed.frequency,
    interval: parsed.interval,
    count: parsed.count,
    until: parsed.until ? new Date(parsed.until).toISOString() : undefined,
    timezone: parsed.timezone,
    byWeekDay: parsed.byWeekDay,
    byMonthDay: parsed.byMonthDay,
    byMonth: parsed.byMonth,
  };
}

function isStillEncrypted(event: CalendarEvent): boolean {
  return event.encryptionState === "encrypted" && !isDecryptedEventReminderContent(event);
}

function eventUid(event: CalendarEvent): string {
  return event.externalId || `${event.id}@${ICS_UID_DOMAIN}`;
}

function toIcsEvent(event: CalendarEvent): IcsBuildEventInput {
  return {
    uid: eventUid(event),
    title: event.title,
    description: event.description,
    start: new Date(event.start),
    end: new Date(event.end),
    allDay: event.allDay,
    timezone: event.timezone,
    location: event.location,
    recurrence: toIcsRecurrenceRule(event.recurrence),
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
    participants: event.participants?.length
      ? event.participants.map((participant) => ({
          email: participant.email,
          displayName: participant.displayName ?? undefined,
          role: participant.role,
          status: participant.status,
        }))
      : undefined,
  };
}

/** Builds the .ics on-device from the decrypted event, so encrypted events export without the server seeing content. */
export function buildEventIcsExport(
  event: CalendarEvent,
  options: { calendarName?: string | null; timezone?: string | null } = {},
): EventIcsExport {
  if (isStillEncrypted(event)) {
    throw new EventIcsExportError(
      "This event is still encrypted on this device, so it can't be exported yet.",
    );
  }

  const start = new Date(event.start);
  const occurrence = event.isRecurringInstance === true;
  const baseUid = event.externalId || event.parentEventId || event.id;
  const icsEvent: IcsBuildEventInput = occurrence
    ? { ...toIcsEvent(event), uid: `${baseUid}-${start.toISOString()}@${ICS_UID_DOMAIN}`, recurrence: undefined }
    : toIcsEvent(event);

  const icsContent = buildIcsEventFile({
    calendar: {
      name: options.calendarName?.trim() || ENCRYPTED_CALENDAR_EXTERNAL_LABEL,
      timezone: resolveTimezone(options.timezone ?? event.timezone),
    },
    event: icsEvent,
  });

  return {
    icsContent,
    filename: toSafeIcsFilename(
      occurrence ? `${event.title}-${start.toISOString().slice(0, 10)}` : event.title,
    ),
  };
}

/** Builds a whole calendar's .ics on-device from the decrypted corpus: series with their exceptions, overrides under the series UID, and every other row on its own. */
export function buildCalendarIcsExport(
  corpus: CalendarEvent[],
  options: { calendarName: string; timezone?: string | null },
): CalendarIcsExport {
  const events = corpus.filter((event) => !isStillEncrypted(event));
  const exportedIds = new Set(events.map((event) => event.id));
  const overrides = new Map<string, { uid: string; recurrenceId: Date }>();
  const exceptionDates = new Map<string, Date[]>();
  for (const series of events) {
    if (!series.recurrence) continue;
    const excluded: Date[] = [];
    for (const exception of series.recurrenceExceptions ?? []) {
      const date = new Date(exception.exceptionDate);
      const childId = exception.type === "modified" ? exception.modifiedEventId : null;
      if (childId && exportedIds.has(childId)) {
        overrides.set(childId, { uid: eventUid(series), recurrenceId: date });
      } else {
        // The server hides every excepted occurrence, so one whose replacement isn't in the file is excluded too.
        excluded.push(date);
      }
    }
    exceptionDates.set(series.id, excluded);
  }

  const icsEvents = events.map((event): IcsBuildEventInput => {
    const override = overrides.get(event.id);
    return {
      ...toIcsEvent(event),
      ...(override ? { uid: override.uid, recurrence: undefined, recurrenceId: override.recurrenceId } : null),
      exceptionDates: exceptionDates.get(event.id),
      status: event.isCancelled ? "CANCELLED" : undefined,
    };
  });

  return {
    icsContent: buildIcsCalendar({
      calendar: { name: options.calendarName, timezone: resolveTimezone(options.timezone) },
      events: icsEvents,
    }),
    filename: toSafeIcsFilename(options.calendarName),
    skipped: corpus.length - events.length,
  };
}
