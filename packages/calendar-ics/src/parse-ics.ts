import * as ical from "node-ical";
import {
  buildIcsExternalId,
  normalizeIcsTimezone,
  parseCalendarMethod,
  type IcsParseResult,
  type IcsRecurrenceRule,
  type ParsedIcsEvent,
} from "./index";

export type { IcsParseResult, ParsedIcsEvent } from "./index";

type EventDate = Date & {
  dateOnly?: boolean;
  tz?: string | number | boolean;
};

type UnknownRecord = Record<string, unknown>;
type IcsEventLike = Pick<
  ical.VEvent,
  | "uid"
  | "summary"
  | "description"
  | "location"
  | "start"
  | "end"
  | "datetype"
  | "rrule"
  | "recurrenceid"
> & {
  recurrences?: Record<string, Omit<ical.VEvent, "recurrences">>;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;

const FREQUENCY_MAP: Record<number, IcsRecurrenceRule["frequency"]> = {
  0: "yearly",
  1: "monthly",
  2: "weekly",
  3: "daily",
};

const FREQUENCY_STRING_MAP: Record<string, IcsRecurrenceRule["frequency"]> = {
  YEARLY: "yearly",
  MONTHLY: "monthly",
  WEEKLY: "weekly",
  DAILY: "daily",
};

const WEEKDAY_CODE_TO_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const CALENDAR_NAME_KEYS = [
  "WR-CALNAME",
  "X-WR-CALNAME",
  "x-wr-calname",
  "name",
  "title",
] as const;

const CALENDAR_DESCRIPTION_KEYS = [
  "WR-CALDESC",
  "X-WR-CALDESC",
  "x-wr-caldesc",
  "description",
] as const;

const CALENDAR_TIMEZONE_KEYS = [
  "WR-TIMEZONE",
  "X-WR-TIMEZONE",
  "x-wr-timezone",
] as const;
const DATE_TIME_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isVCalendar(
  component: ical.CalendarComponent | undefined,
): component is ical.VCalendar {
  return !!component && component.type === "VCALENDAR";
}

function isVEvent(
  component: ical.CalendarComponent | undefined,
): component is ical.VEvent {
  return !!component && component.type === "VEVENT";
}

function getFirstStringValue(
  component: UnknownRecord,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = component[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function coerceDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function getDateTimePartsFormatter(timezone: string): Intl.DateTimeFormat {
  const resolvedTimezone = normalizeIcsTimezone(timezone) || "UTC";
  const cachedFormatter = DATE_TIME_PARTS_FORMATTER_CACHE.get(resolvedTimezone);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  DATE_TIME_PARTS_FORMATTER_CACHE.set(resolvedTimezone, formatter);
  return formatter;
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const formatter = getDateTimePartsFormatter(timezone);
  const parts = formatter.formatToParts(date);
  const lookup = (
    type: "year" | "month" | "day" | "hour" | "minute" | "second",
  ) => parts.find((part) => part.type === type)?.value;

  const year = Number.parseInt(lookup("year") || "0", 10);
  const month = Number.parseInt(lookup("month") || "1", 10);
  const day = Number.parseInt(lookup("day") || "1", 10);
  const hour = Number.parseInt(lookup("hour") || "0", 10);
  const minute = Number.parseInt(lookup("minute") || "0", 10);
  const second = Number.parseInt(lookup("second") || "0", 10);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

function getRuntimeLocalDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function addDaysToDateParts(
  dateParts: { year: number; month: number; day: number },
  days: number,
): {
  year: number;
  month: number;
  day: number;
} {
  const copy = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day),
  );
  copy.setUTCDate(copy.getUTCDate() + days);

  return {
    year: copy.getUTCFullYear(),
    month: copy.getUTCMonth() + 1,
    day: copy.getUTCDate(),
  };
}

function buildUtcDateFromTimeZoneDateParts(
  dateParts: { year: number; month: number; day: number },
  timezone: string,
  endOfDay: boolean,
): Date {
  const resolvedTimezone = normalizeIcsTimezone(timezone) || "UTC";
  const utcGuess = new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );

  const initialOffset = getTimeZoneOffsetMs(utcGuess, resolvedTimezone);
  let normalized = new Date(utcGuess.getTime() - initialOffset);
  const adjustedOffset = getTimeZoneOffsetMs(normalized, resolvedTimezone);

  if (adjustedOffset !== initialOffset) {
    normalized = new Date(utcGuess.getTime() - adjustedOffset);
  }

  if (endOfDay) {
    normalized.setMilliseconds(999);
  }

  return normalized;
}

function normalizeAllDayRange(
  start: Date,
  end: Date | undefined,
  timezone: string,
): {
  start: Date;
  end: Date;
} {
  const startDateParts = getRuntimeLocalDateParts(start);
  const lastCoveredDateParts =
    end && end.getTime() > start.getTime()
      ? addDaysToDateParts(getRuntimeLocalDateParts(end), -1)
      : startDateParts;

  return {
    start: buildUtcDateFromTimeZoneDateParts(startDateParts, timezone, false),
    end: buildUtcDateFromTimeZoneDateParts(lastCoveredDateParts, timezone, true),
  };
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function parseNumberArray(
  value: unknown,
  min: number,
  max: number,
): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value
    .filter((entry): entry is number => typeof entry === "number")
    .filter((entry) => Number.isInteger(entry) && entry >= min && entry <= max);

  if (parsed.length === 0) {
    return undefined;
  }

  return Array.from(new Set(parsed));
}

function toSundayFirstWeekdayIndex(mondayFirstIndex: number): number | undefined {
  if (!Number.isInteger(mondayFirstIndex) || mondayFirstIndex < 0 || mondayFirstIndex > 6) {
    return undefined;
  }

  return mondayFirstIndex === 6 ? 0 : mondayFirstIndex + 1;
}

function parseWeekdayEntry(entry: unknown): number | undefined {
  if (typeof entry === "number") {
    return toSundayFirstWeekdayIndex(entry);
  }

  if (typeof entry === "string") {
    const code = entry.length >= 2 ? entry.slice(-2).toUpperCase() : entry.toUpperCase();
    return WEEKDAY_CODE_TO_INDEX[code];
  }

  if (Array.isArray(entry) && entry.length > 0) {
    return parseWeekdayEntry(entry[0]);
  }

  if (isRecord(entry)) {
    if (typeof entry.weekday === "number") {
      return toSundayFirstWeekdayIndex(entry.weekday);
    }

    if (typeof entry.toString === "function") {
      return parseWeekdayEntry(entry.toString());
    }
  }

  return undefined;
}

function parseByWeekDay(value: unknown): number[] | undefined {
  const source = Array.isArray(value) ? value : value === undefined ? [] : [value];

  const parsed = source
    .map((entry) => parseWeekdayEntry(entry))
    .filter((entry): entry is number => entry !== undefined);

  if (parsed.length === 0) {
    return undefined;
  }

  return Array.from(new Set(parsed));
}

function parseRecurrenceRule(rrule: unknown): IcsRecurrenceRule | undefined {
  if (!isRecord(rrule)) {
    return undefined;
  }

  const options = isRecord(rrule.options) ? rrule.options : undefined;
  const origOptions = isRecord(rrule.origOptions) ? rrule.origOptions : undefined;
  const source = origOptions && Object.keys(origOptions).length > 0 ? origOptions : options;

  if (!source) {
    return undefined;
  }

  const rawFrequency = source.freq ?? options?.freq;
  let frequency: IcsRecurrenceRule["frequency"] | undefined;

  if (typeof rawFrequency === "number") {
    frequency = FREQUENCY_MAP[rawFrequency];
  } else if (typeof rawFrequency === "string") {
    frequency = FREQUENCY_STRING_MAP[rawFrequency.toUpperCase()];
  }

  if (!frequency) {
    return undefined;
  }

  const recurrence: IcsRecurrenceRule = {
    frequency,
    interval: parsePositiveInt(source.interval ?? options?.interval) ?? 1,
  };

  const count = parsePositiveInt(source.count ?? options?.count);
  if (count !== undefined) {
    recurrence.count = count;
  }

  const until = coerceDate(source.until ?? options?.until);
  if (until) {
    recurrence.until = until.toISOString();
  }

  const byWeekDay = parseByWeekDay(
    source.byweekday ?? source.bynweekday ?? options?.byweekday ?? options?.bynweekday,
  );
  if (byWeekDay?.length) {
    recurrence.byWeekDay = byWeekDay;
  }

  const byMonthDay = parseNumberArray(
    source.bymonthday ?? options?.bymonthday,
    1,
    31,
  );
  if (byMonthDay?.length) {
    recurrence.byMonthDay = byMonthDay;
  }

  const byMonth = parseNumberArray(source.bymonth ?? options?.bymonth, 1, 12);
  if (byMonth?.length) {
    recurrence.byMonth = byMonth;
  }

  const recurrenceTimezone = normalizeIcsTimezone(
    typeof source.tzid === "string"
      ? source.tzid
      : typeof options?.tzid === "string"
        ? options.tzid
        : undefined,
  );

  if (recurrenceTimezone) {
    recurrence.timezone = recurrenceTimezone;
  }

  return recurrence;
}

function isAllDayEvent(event: Pick<ical.VEvent, "datetype" | "start">): boolean {
  return event.datetype === "date" || (event.start as EventDate).dateOnly === true;
}

function getEventTimezone(event: Pick<ical.VEvent, "start" | "end">): string | undefined {
  const startTz = (event.start as EventDate).tz;
  if (typeof startTz === "string" && startTz.trim()) {
    return normalizeIcsTimezone(startTz);
  }

  const endTz = (event.end as EventDate).tz;
  if (typeof endTz === "string" && endTz.trim()) {
    return normalizeIcsTimezone(endTz);
  }

  return undefined;
}

function parseVEvent(
  event: IcsEventLike,
  userTimezone: string,
  calendarTimezone?: string,
): ParsedIcsEvent | null {
  const sourceUid = event.uid?.trim();
  if (!sourceUid) {
    return null;
  }

  if (!event.summary?.trim()) {
    return null;
  }

  let start = coerceDate(event.start);
  if (!start) {
    return null;
  }

  const allDay = isAllDayEvent(event);
  const allDayTimezone = normalizeIcsTimezone(userTimezone) || "UTC";
  const eventTimezone = getEventTimezone(event);
  let end = coerceDate(event.end);

  if (!end) {
    if (allDay) {
      end = new Date(start.getTime() + DAY_IN_MS);
    } else {
      end = new Date(start.getTime() + HOUR_IN_MS);
    }
  }

  if (allDay) {
    const normalizedAllDayRange = normalizeAllDayRange(
      start,
      end,
      allDayTimezone,
    );
    start = normalizedAllDayRange.start;
    end = normalizedAllDayRange.end;
  }

  const recurrenceIdDate = coerceDate(event.recurrenceid);
  const recurrenceId = recurrenceIdDate?.toISOString();
  const uid = buildIcsExternalId(sourceUid, recurrenceId);

  const timezone =
    eventTimezone ??
    (allDay
      ? allDayTimezone
      : calendarTimezone
        ? normalizeIcsTimezone(calendarTimezone)
        : userTimezone);

  const recurrenceRule = parseRecurrenceRule(event.rrule);
  if (recurrenceRule && !recurrenceRule.timezone && timezone) {
    recurrenceRule.timezone = timezone;
  }

  return {
    uid,
    sourceUid,
    recurrenceId,
    title: event.summary.trim(),
    description: event.description?.trim() || undefined,
    start,
    end,
    allDay,
    location: event.location?.trim() || undefined,
    recurrence: recurrenceRule,
    timezone,
  };
}

function collectEventCandidates(baseEvent: ical.VEvent): IcsEventLike[] {
  const candidates: IcsEventLike[] = [baseEvent];

  if (baseEvent.recurrences) {
    for (const recurrenceEvent of Object.values(baseEvent.recurrences)) {
      if (!recurrenceEvent) {
        continue;
      }

      candidates.push(recurrenceEvent);
    }
  }

  return candidates;
}

export function parseICSFile(
  icsContent: string,
  userTimezone: string = "UTC",
): IcsParseResult {
  const result: IcsParseResult = {
    events: [],
    errors: [],
    method: parseCalendarMethod(icsContent),
  };

  try {
    const parsed = ical.parseICS(icsContent);

    for (const component of Object.values(parsed)) {
      if (!isVCalendar(component)) {
        continue;
      }

      const metadata = component as unknown as UnknownRecord;
      result.calendarName =
        result.calendarName ?? getFirstStringValue(metadata, CALENDAR_NAME_KEYS);
      result.calendarDescription =
        result.calendarDescription ??
        getFirstStringValue(metadata, CALENDAR_DESCRIPTION_KEYS);
      result.calendarTimezone =
        result.calendarTimezone ??
        normalizeIcsTimezone(
          getFirstStringValue(metadata, CALENDAR_TIMEZONE_KEYS),
        );
    }

    const eventsById = new Map<string, ParsedIcsEvent>();

    for (const component of Object.values(parsed)) {
      if (!isVEvent(component)) {
        continue;
      }

      const candidates = collectEventCandidates(component);
      for (const candidate of candidates) {
        try {
          const parsedEvent = parseVEvent(
            candidate,
            userTimezone,
            result.calendarTimezone,
          );

          if (!parsedEvent) {
            continue;
          }

          eventsById.set(parsedEvent.uid, parsedEvent);
        } catch (error) {
          const externalId = buildIcsExternalId(
            candidate.uid || "unknown",
            coerceDate(candidate.recurrenceid)?.toISOString(),
          );
          const message = `Failed to parse event ${externalId}: ${error instanceof Error ? error.message : "Unknown error"}`;
          result.errors.push(message);
        }
      }
    }

    result.events = Array.from(eventsById.values());
  } catch (error) {
    const message = `Failed to parse ICS file: ${error instanceof Error ? error.message : "Unknown error"}`;
    result.errors.push(message);
  }

  return result;
}
