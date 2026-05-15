import type { CalendarKind } from "./national-holiday-calendars";

export const CALENDAR_METHOD_TYPES = [
  "PUBLISH",
  "REQUEST",
  "REPLY",
  "ADD",
  "CANCEL",
  "REFRESH",
  "COUNTER",
  "DECLINECOUNTER",
] as const;

export {
  findNationalHolidayCalendarByUrl,
  NATIONAL_HOLIDAY_CALENDARS,
} from "./national-holiday-calendars";
export type {
  CalendarKind,
  NationalHolidayCalendarCatalogEntry,
} from "./national-holiday-calendars";

export type CalendarMethodType = (typeof CALENDAR_METHOD_TYPES)[number];

export const DEFAULT_CALENDAR_METHOD: CalendarMethodType = "PUBLISH";

const CALENDAR_METHOD_SET = new Set<string>(CALENDAR_METHOD_TYPES);

export function isCalendarMethodType(
  value: string,
): value is CalendarMethodType {
  return CALENDAR_METHOD_SET.has(value);
}

export function parseCalendarMethod(icsContent: string): CalendarMethodType {
  const match = /(?:^|\r?\n)METHOD:([A-Z]+)/m.exec(icsContent);
  if (!match?.[1]) {
    return DEFAULT_CALENDAR_METHOD;
  }

  return isCalendarMethodType(match[1]) ? match[1] : DEFAULT_CALENDAR_METHOD;
}

export type IcsRecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface IcsRecurrenceRule {
  frequency: IcsRecurrenceFrequency;
  interval: number;
  count?: number;
  until?: string;
  timezone?: string;
  byWeekDay?: number[];
  byMonthDay?: number[];
  byMonth?: number[];
}

export interface ParsedIcsEvent {
  uid: string;
  sourceUid: string;
  recurrenceId?: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  recurrence?: IcsRecurrenceRule;
  timezone?: string;
}

export interface IcsParseResult {
  events: ParsedIcsEvent[];
  errors: string[];
  method: CalendarMethodType;
  calendarName?: string;
  calendarDescription?: string;
  calendarTimezone?: string;
}

export const RECURRENCE_EXTERNAL_ID_SEPARATOR = "::RECURRENCE::";

export function buildIcsExternalId(uid: string, recurrenceId?: string): string {
  const normalizedUid = uid.trim();
  if (!normalizedUid) {
    return normalizedUid;
  }

  if (!recurrenceId) {
    return normalizedUid;
  }

  return `${normalizedUid}${RECURRENCE_EXTERNAL_ID_SEPARATOR}${recurrenceId}`;
}

const ICS_TO_IANA_TIMEZONE_MAP: Record<string, string> = {
  "W. Europe Standard Time": "Europe/Amsterdam",
  "Central European Standard Time": "Europe/Paris",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "GMT Standard Time": "Europe/London",
  UTC: "UTC",
  "Greenwich Standard Time": "UTC",
};

export function normalizeIcsTimezone(
  timezone?: string | null,
): string | undefined {
  if (!timezone) {
    return undefined;
  }

  const trimmed = timezone.trim().replace(/^"(.*)"$/, "$1");
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === "tzone://Microsoft/Utc") {
    return "UTC";
  }

  return ICS_TO_IANA_TIMEZONE_MAP[trimmed] ?? trimmed;
}

export interface ImportIcsRequest {
  calendarId: string;
  icsContent: string;
  fileName?: string;
}

export interface ImportIcsResponse {
  success: boolean;
  eventsCreated: number;
  eventsTotal: number;
  fileName?: string;
  calendarName?: string;
  errors?: string[];
}

export type CalendarSubscriptionStatus = "success" | "error" | "pending";

export interface CalendarSummaryForSubscription {
  id: string;
  name: string;
  color: string;
  kind?: CalendarKind;
  isPublic?: boolean;
}

export interface CalendarSubscriptionSummary {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSyncAt?: string | null;
  lastSyncStatus: CalendarSubscriptionStatus;
  lastErrorMessage?: string | null;
  calendar: CalendarSummaryForSubscription;
  _count: {
    syncLogs: number;
  };
}

export interface CreateCalendarSubscriptionRequest {
  name: string;
  url: string;
  color?: string;
}

export interface UpdateCalendarSubscriptionRequest {
  name?: string;
  color?: string;
  isActive?: boolean;
  syncIntervalMinutes?: number;
}

export interface CalendarSubscriptionSyncResponse {
  status: "success" | "error";
  message?: string;
  eventsAdded?: number;
  eventsUpdated?: number;
  eventsDeleted?: number;
  errors?: string[];
}

export interface DeleteCalendarSubscriptionResponse {
  success: boolean;
}

export interface CalendarShareLinkResponse {
  calendarId: string;
  calendarName: string;
  enabled: boolean;
  shareUrl: string | null;
}

export interface CreateCalendarShareLinkRequest {
  regenerate?: boolean;
}

export interface DisableCalendarShareLinkResponse {
  success: boolean;
}

export interface IcsCalendarMetadata {
  name?: string;
  description?: string;
  timezone?: string;
  method?: CalendarMethodType;
  productId?: string;
  sourceUrl?: string;
}

export interface IcsBuildEventInput {
  uid?: string;
  title: string;
  description?: string | null;
  start: Date;
  end: Date;
  allDay?: boolean;
  timezone?: string | null;
  location?: string | null;
  recurrence?: IcsRecurrenceRule | null;
  createdAt?: Date;
  updatedAt?: Date;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  sequence?: number;
  sourceUrl?: string;
}

const WEEKDAY_INDEX_TO_CODE = [
  "SU",
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
] as const;
const ICS_LINE_BREAK = "\r\n";
const DEFAULT_PRODUCT_ID = "-//Solace Calendar//Calendar Export//EN";
const ICS_MAX_LINE_OCTETS = 75;
const ICS_CONTINUATION_MAX_LINE_OCTETS = 74;
const TEXT_ENCODER = new TextEncoder();
const DATE_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function sanitizeIcsUri(value: string): string {
  return value.replace(/\r?\n/g, "").trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function formatDateTimeStamp(date: Date): string {
  return `${formatDateStamp(date)}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

function getDatePartsFormatter(timezone: string): Intl.DateTimeFormat {
  const resolvedTimezone = normalizeIcsTimezone(timezone) || "UTC";
  const cachedFormatter = DATE_PARTS_FORMATTER_CACHE.get(resolvedTimezone);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolvedTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  DATE_PARTS_FORMATTER_CACHE.set(resolvedTimezone, formatter);
  return formatter;
}

function formatDateStampInTimeZone(date: Date, timezone: string): string {
  const resolvedTimezone = normalizeIcsTimezone(timezone) || "UTC";

  try {
    const parts = getDatePartsFormatter(resolvedTimezone).formatToParts(date);
    const lookup = (type: "year" | "month" | "day") =>
      parts.find((part) => part.type === type)?.value;

    const year = lookup("year");
    const month = lookup("month");
    const day = lookup("day");

    if (year && month && day) {
      return `${year}${month}${day}`;
    }
  } catch {
    // Fall back to UTC if the provided timezone is not usable.
  }

  return formatDateStamp(date);
}

function addDaysToDateStamp(dateStamp: string, days: number): string {
  if (!/^\d{8}$/.test(dateStamp)) {
    return dateStamp;
  }

  const year = Number.parseInt(dateStamp.slice(0, 4), 10);
  const month = Number.parseInt(dateStamp.slice(4, 6), 10);
  const day = Number.parseInt(dateStamp.slice(6, 8), 10);
  const copy = new Date(Date.UTC(year, month - 1, day));
  copy.setUTCDate(copy.getUTCDate() + days);
  return formatDateStamp(copy);
}

function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function foldIcsLine(line: string): string[] {
  const maxLineLengths = [
    ICS_MAX_LINE_OCTETS,
    ICS_CONTINUATION_MAX_LINE_OCTETS,
  ];
  const segments: string[] = [];
  let currentSegment = "";
  let currentOctets = 0;
  let limit = maxLineLengths[0] ?? ICS_MAX_LINE_OCTETS;

  for (const character of line) {
    const characterOctets = TEXT_ENCODER.encode(character).length;

    if (currentOctets > 0 && currentOctets + characterOctets > limit) {
      segments.push(currentSegment);
      currentSegment = character;
      currentOctets = characterOctets;
      limit = maxLineLengths[1] ?? ICS_CONTINUATION_MAX_LINE_OCTETS;
      continue;
    }

    currentSegment += character;
    currentOctets += characterOctets;
  }

  if (currentSegment || segments.length === 0) {
    segments.push(currentSegment);
  }

  return segments.map((segment, index) =>
    index === 0 ? segment : ` ${segment}`,
  );
}

function foldIcsLines(lines: string[]): string[] {
  return lines.flatMap((line) => foldIcsLine(line));
}

function normalizeEventRange(
  event: Pick<IcsBuildEventInput, "start" | "end" | "allDay">,
): {
  start: Date;
  end: Date;
} {
  const start = new Date(event.start);
  let end = new Date(event.end);

  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid event start date");
  }

  if (Number.isNaN(end.getTime())) {
    throw new Error("Invalid event end date");
  }

  if (event.allDay) {
    if (end.getTime() < start.getTime()) {
      end = new Date(start);
    }
  } else if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }

  return { start, end };
}

function buildRruleString(recurrence: IcsRecurrenceRule): string {
  const segments: string[] = [];

  segments.push(`FREQ=${recurrence.frequency.toUpperCase()}`);

  if (recurrence.interval > 1) {
    segments.push(`INTERVAL=${recurrence.interval}`);
  }

  if (recurrence.count && recurrence.count > 0) {
    segments.push(`COUNT=${Math.floor(recurrence.count)}`);
  }

  if (recurrence.until) {
    const until = new Date(recurrence.until);
    if (!Number.isNaN(until.getTime())) {
      segments.push(`UNTIL=${formatDateTimeStamp(until)}`);
    }
  }

  if (recurrence.byWeekDay?.length) {
    const weekdays = recurrence.byWeekDay
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .map((day) => WEEKDAY_INDEX_TO_CODE[day]);

    if (weekdays.length) {
      segments.push(`BYDAY=${Array.from(new Set(weekdays)).join(",")}`);
    }
  }

  if (recurrence.byMonthDay?.length) {
    const monthDays = recurrence.byMonthDay
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31)
      .map((day) => String(day));

    if (monthDays.length) {
      segments.push(`BYMONTHDAY=${Array.from(new Set(monthDays)).join(",")}`);
    }
  }

  if (recurrence.byMonth?.length) {
    const months = recurrence.byMonth
      .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
      .map((month) => String(month));

    if (months.length) {
      segments.push(`BYMONTH=${Array.from(new Set(months)).join(",")}`);
    }
  }

  return segments.join(";");
}

function buildEventLines(
  event: IcsBuildEventInput,
  dtStamp: Date,
  calendarTimezone?: string,
): string[] {
  const { start, end } = normalizeEventRange(event);
  const uid =
    event.uid?.trim() || `${crypto.randomUUID()}@solace-calendar.local`;
  const allDay = !!event.allDay;
  const createdAt =
    event.createdAt && !Number.isNaN(event.createdAt.getTime())
      ? event.createdAt
      : dtStamp;
  const updatedAt =
    event.updatedAt && !Number.isNaN(event.updatedAt.getTime())
      ? event.updatedAt
      : dtStamp;

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatDateTimeStamp(dtStamp)}`,
    `CREATED:${formatDateTimeStamp(createdAt)}`,
    `LAST-MODIFIED:${formatDateTimeStamp(updatedAt)}`,
    `SUMMARY:${escapeIcsText(event.title.trim() || "Untitled Event")}`,
  ];

  if (allDay) {
    const timezone =
      normalizeIcsTimezone(event.timezone ?? calendarTimezone) || "UTC";
    const startDateStamp = formatDateStampInTimeZone(start, timezone);
    const endExclusiveDateStamp = addDaysToDateStamp(
      formatDateStampInTimeZone(end, timezone),
      1,
    );

    lines.push(`DTSTART;VALUE=DATE:${startDateStamp}`);
    lines.push(`DTEND;VALUE=DATE:${endExclusiveDateStamp}`);
  } else {
    lines.push(`DTSTART:${formatDateTimeStamp(start)}`);
    lines.push(`DTEND:${formatDateTimeStamp(end)}`);
  }

  if (event.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`);
  }

  if (event.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  }

  if (event.status) {
    lines.push(`STATUS:${event.status}`);
  }

  if (event.sequence !== undefined && Number.isFinite(event.sequence)) {
    lines.push(`SEQUENCE:${Math.max(0, Math.floor(event.sequence))}`);
  }

  if (event.sourceUrl?.trim()) {
    lines.push(`URL:${sanitizeIcsUri(event.sourceUrl.trim())}`);
  }

  if (event.recurrence) {
    const rrule = buildRruleString(event.recurrence);
    if (rrule) {
      lines.push(`RRULE:${rrule}`);
    }
  }

  lines.push("END:VEVENT");
  return lines;
}

export function buildIcsCalendar(options: {
  calendar: IcsCalendarMetadata;
  events: IcsBuildEventInput[];
}): string {
  const dtStamp = new Date();
  const calendarName = options.calendar.name?.trim() || "Calendar";
  const method = options.calendar.method || DEFAULT_CALENDAR_METHOD;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${options.calendar.productId?.trim() || DEFAULT_PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  if (options.calendar.description?.trim()) {
    lines.push(
      `X-WR-CALDESC:${escapeIcsText(options.calendar.description.trim())}`,
    );
  }

  if (options.calendar.timezone?.trim()) {
    lines.push(
      `X-WR-TIMEZONE:${escapeIcsText(options.calendar.timezone.trim())}`,
    );
  }

  if (options.calendar.sourceUrl?.trim()) {
    lines.push(`URL:${sanitizeIcsUri(options.calendar.sourceUrl.trim())}`);
  }

  for (const event of options.events) {
    lines.push(...buildEventLines(event, dtStamp, options.calendar.timezone));
  }

  lines.push("END:VCALENDAR");
  return `${foldIcsLines(lines).join(ICS_LINE_BREAK)}${ICS_LINE_BREAK}`;
}

export function buildIcsEventFile(options: {
  calendar: IcsCalendarMetadata;
  event: IcsBuildEventInput;
}): string {
  return buildIcsCalendar({
    calendar: options.calendar,
    events: [options.event],
  });
}

export type {
  RecurrenceFrequency,
  RecurrenceInstance,
  RecurrenceRule,
} from "./recurrence";
