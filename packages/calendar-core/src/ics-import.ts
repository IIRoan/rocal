import ICAL from "ical.js";
import { normalizeIcsTimezone } from "@workspace/calendar-ics";
import {
  eventParticipantInputSchema,
  recurrenceRuleObjectSchema,
  timezoneSchema,
} from "./route-schemas";
import { resolveTimezone, zonedDateTimeToUtc } from "./timezone";
import type { CreateEventRequest } from "./types";

type IcsTime = InstanceType<typeof ICAL.Time>;
type IcsComponent = InstanceType<typeof ICAL.Component>;
export type ParsedImportEvent = Omit<CreateEventRequest, "calendarId"> & {
  sourceUid: string;
  occurrenceDate?: string;
  excludedDates: string[];
};

function text(component: IcsComponent, name: string): string {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" ? value : "";
}

function eventTimezone(component: IcsComponent, fallback: string): string {
  const start = component.getFirstPropertyValue("dtstart");
  if (
    start instanceof ICAL.Time &&
    !start.isDate &&
    start.zone === ICAL.Timezone.utcTimezone
  )
    return "UTC";
  const tzid = component.getFirstProperty("dtstart")?.getParameter("tzid");
  const zone = normalizeIcsTimezone(typeof tzid === "string" ? tzid : fallback);
  return timezoneSchema.parse(zone ?? fallback);
}

function instant(time: IcsTime, timezone: string): Date {
  if (!time.isDate && time.zone !== ICAL.Timezone.localTimezone)
    return time.toJSDate();
  return zonedDateTimeToUtc(
    {
      year: time.year,
      month: time.month,
      day: time.day,
      hours: time.isDate ? 0 : time.hour,
      minutes: time.isDate ? 0 : time.minute,
      seconds: time.isDate ? 0 : time.second,
    },
    timezone,
  );
}

function recurrence(
  component: IcsComponent,
  timezone: string,
): string | undefined {
  const rule = component.getFirstPropertyValue("rrule");
  if (!(rule instanceof ICAL.Recur)) return undefined;
  if (
    Object.keys(rule.parts).some(
      (key) => !["BYDAY", "BYMONTHDAY", "BYMONTH"].includes(key),
    )
  ) {
    throw new Error("Unsupported recurrence");
  }
  const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const parsed = recurrenceRuleObjectSchema.parse({
    frequency: rule.freq.toLowerCase(),
    interval: rule.interval,
    count: rule.count ?? undefined,
    until: rule.until ? instant(rule.until, timezone).toISOString() : undefined,
    timezone,
    byWeekDay: rule.parts.BYDAY?.map((day) => weekdays.indexOf(day)),
    byMonthDay: rule.parts.BYMONTHDAY,
    byMonth: rule.parts.BYMONTH,
  });
  return JSON.stringify(parsed);
}

function participants(component: IcsComponent) {
  return ["organizer", "attendee"].flatMap((role) =>
    component.getAllProperties(role).map((property) => {
      const value = property.getFirstValue();
      const name = property.getParameter("cn");
      const state = property.getParameter("partstat");
      const status =
        typeof state === "string" ? state.toLowerCase() : "pending";
      return eventParticipantInputSchema.parse({
        email:
          typeof value === "string"
            ? value
                .replace(/^mailto:/i, "")
                .trim()
                .toLowerCase()
            : "",
        displayName: typeof name === "string" ? name : undefined,
        role,
        status:
          role === "organizer"
            ? "accepted"
            : ["accepted", "declined", "tentative"].includes(status)
              ? status
              : "pending",
      });
    }),
  );
}

function parseEvent(
  component: IcsComponent,
  fallback: string,
): ParsedImportEvent {
  const event = new ICAL.Event(component);
  if (
    !event.uid ||
    !component.hasProperty("dtstart") ||
    component.hasProperty("rdate")
  )
    throw new Error("Unsupported event");
  const timezone = eventTimezone(component, fallback);
  const start = instant(event.startDate, timezone);
  const end = instant(event.endDate, timezone);
  if (
    !event.startDate.isDate &&
    !component.hasProperty("dtend") &&
    !component.hasProperty("duration")
  )
    end.setTime(start.getTime() + 60 * 60 * 1000);
  if (event.startDate.isDate) end.setTime(end.getTime() - 1);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  )
    throw new Error("Invalid event dates");
  const override = component.getFirstPropertyValue("recurrence-id");
  return {
    sourceUid: event.uid,
    occurrenceDate:
      override instanceof ICAL.Time
        ? instant(override, timezone).toISOString()
        : undefined,
    title: event.summary || "Untitled event",
    description: event.description || undefined,
    location: event.location || undefined,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: event.startDate.isDate,
    timezone,
    recurrence: recurrence(component, timezone),
    participants: participants(component),
    excludedDates: [
      ...new Set(
        component
          .getAllProperties("exdate")
          .flatMap((property) =>
            property
              .getValues()
              .flatMap((value: unknown) =>
                value instanceof ICAL.Time
                  ? [instant(value, timezone).toISOString()]
                  : [],
              ),
          ),
      ),
    ],
  };
}

/** Parses untrusted ICS only on-device; errors never echo file contents. */
export function parseIcsImport(content: string, timezone?: string | null) {
  let calendar: IcsComponent;
  try {
    calendar = ICAL.Component.fromString(content);
    if (calendar.name !== "vcalendar") throw new Error("Invalid calendar");
  } catch {
    throw new Error("Invalid calendar file");
  }
  const fallback =
    normalizeIcsTimezone(text(calendar, "x-wr-timezone")) ??
    resolveTimezone(timezone);
  const events: ParsedImportEvent[] = [];
  const errors: string[] = [];
  const components = calendar.getAllSubcomponents("vevent");
  if (components.length > 10_000)
    throw new Error("Calendar file contains too many events");
  for (const [index, component] of components.entries()) {
    try {
      events.push(parseEvent(component, fallback));
    } catch {
      errors.push(
        `Event ${index + 1} has invalid dates, participants, or an unsupported recurrence rule.`,
      );
    }
  }
  return {
    events,
    errors,
    eventsTotal: components.length,
    calendarName: text(calendar, "x-wr-calname") || undefined,
  };
}
