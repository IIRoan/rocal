import {
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

/** Builds the .ics on-device from the decrypted event, so encrypted events export without the server seeing content. */
export function buildEventIcsExport(
  event: CalendarEvent,
  options: { calendarName?: string | null; timezone?: string | null } = {},
): EventIcsExport {
  if (event.encryptionState === "encrypted" && !isDecryptedEventReminderContent(event)) {
    throw new EventIcsExportError(
      "This event is still encrypted on this device, so it can't be exported yet.",
    );
  }

  const start = new Date(event.start);
  const end = new Date(event.end);
  const occurrence = event.isRecurringInstance === true;
  const baseUid = event.externalId || event.parentEventId || event.id;
  const participants = event.participants?.length
    ? event.participants.map((participant) => ({
        email: participant.email,
        displayName: participant.displayName ?? undefined,
        role: participant.role,
        status: participant.status,
      }))
    : undefined;

  const icsEvent: IcsBuildEventInput = {
    uid: occurrence
      ? `${baseUid}-${start.toISOString()}@${ICS_UID_DOMAIN}`
      : event.externalId || `${event.id}@${ICS_UID_DOMAIN}`,
    title: event.title,
    description: event.description,
    start,
    end,
    allDay: event.allDay,
    timezone: event.timezone,
    location: event.location,
    recurrence: occurrence ? undefined : toIcsRecurrenceRule(event.recurrence),
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
    participants,
  };

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
