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
export {
  isLikelyIcsFeedUrl,
  normalizeSubscriptionFeedUrl,
  SUBSCRIPTION_FEED_URL_HELP_TEXT,
} from "./subscription-url";
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
  participants?: IcsParticipant[];
}

export type IcsParticipantRole = "organizer" | "attendee";
export type IcsParticipantStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "tentative";

export interface IcsParticipant {
  email: string;
  displayName?: string;
  role?: IcsParticipantRole;
  status?: IcsParticipantStatus;
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
  timezone?: string;
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
  participants?: IcsParticipant[];
  /** The original start of the series occurrence this override replaces. */
  recurrenceId?: Date | null;
  exceptionDates?: Date[];
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
const DATE_TIME_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const VTIMEZONE_CACHE = new Map<string, string[]>();
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeIcsParamValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, " ")
    .replace(/"/g, '\\"')
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

function getDateTimePartsFormatter(timezone: string): Intl.DateTimeFormat {
  const cachedFormatter = DATE_TIME_PARTS_FORMATTER_CACHE.get(timezone);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  DATE_TIME_PARTS_FORMATTER_CACHE.set(timezone, formatter);
  return formatter;
}

/** The wall clock in `timezone` as UTC fields; `% 24` because some engines print midnight as hour 24. */
function zonedWallClock(date: Date, timezone: string): Date {
  const parts = getDateTimePartsFormatter(timezone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  return new Date(
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour") % 24,
      part("minute"),
      part("second"),
    ),
  );
}

/** `YYYYMMDDTHHMMSS` wall-clock time in `timezone`, the value of a TZID date-time property. */
export function formatLocalDateTimeStamp(date: Date, timezone: string): string {
  return formatDateTimeStamp(zonedWallClock(date, timezone)).slice(0, -1);
}

function utcOffsetMinutes(instant: number, timezone: string): number {
  const date = new Date(instant);
  return Math.round(
    (zonedWallClock(date, timezone).getTime() - date.getTime()) / MINUTE_MS,
  );
}

function formatUtcOffset(minutes: number): string {
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${pad2(Math.floor(absolute / 60))}${pad2(absolute % 60)}`;
}

type OffsetTransition = { at: number; from: number; to: number };

function findOffsetTransitions(timezone: string, year: number): OffsetTransition[] {
  const transitions: OffsetTransition[] = [];
  let previous = utcOffsetMinutes(Date.UTC(year, 0, 1), timezone);
  for (let day = Date.UTC(year, 0, 2); day <= Date.UTC(year + 1, 0, 1); day += DAY_MS) {
    const current = utcOffsetMinutes(day, timezone);
    if (current === previous) continue;
    let before = day - DAY_MS;
    let after = day;
    while (after - before > MINUTE_MS) {
      const middle = before + Math.floor((after - before) / 2 / MINUTE_MS) * MINUTE_MS;
      if (utcOffsetMinutes(middle, timezone) === previous) before = middle;
      else after = middle;
    }
    transitions.push({ at: after, from: previous, to: current });
    previous = current;
  }
  return transitions;
}

function observanceLines({ at, from, to }: OffsetTransition): string[] {
  const onset = new Date(at + from * MINUTE_MS);
  const month = onset.getUTCMonth();
  const day = onset.getUTCDate();
  const weekday = onset.getUTCDay();
  const daysInMonth = new Date(Date.UTC(onset.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const nth = day + 7 > daysInMonth ? -1 : Math.ceil(day / 7);
  const firstWeekday1970 = new Date(Date.UTC(1970, month, 1)).getUTCDay();
  const lastDay1970 = new Date(Date.UTC(1970, month + 1, 0));
  const anchorDay =
    nth === -1
      ? lastDay1970.getUTCDate() - ((lastDay1970.getUTCDay() - weekday + 7) % 7)
      : 1 + ((weekday - firstWeekday1970 + 7) % 7) + (nth - 1) * 7;
  const anchor = new Date(
    Date.UTC(1970, month, anchorDay, onset.getUTCHours(), onset.getUTCMinutes()),
  );
  const kind = to > from ? "DAYLIGHT" : "STANDARD";
  return [
    `BEGIN:${kind}`,
    `DTSTART:${formatDateTimeStamp(anchor).slice(0, -1)}`,
    `TZOFFSETFROM:${formatUtcOffset(from)}`,
    `TZOFFSETTO:${formatUtcOffset(to)}`,
    `RRULE:FREQ=YEARLY;BYMONTH=${month + 1};BYDAY=${nth}${WEEKDAY_INDEX_TO_CODE[weekday]}`,
    `END:${kind}`,
  ];
}

/** The zone's rules in `referenceYear`, anchored in 1970 so every year expands; years before a rule change get approximate offsets. */
export function buildVTimezoneLines(timezone: string, referenceYear: number): string[] {
  const cacheKey = `${timezone}|${referenceYear}`;
  const cached = VTIMEZONE_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const january = utcOffsetMinutes(Date.UTC(referenceYear, 0, 1), timezone);
  const july = utcOffsetMinutes(Date.UTC(referenceYear, 6, 1), timezone);
  const observances =
    january === july
      ? [
          "BEGIN:STANDARD",
          "DTSTART:19700101T000000",
          `TZOFFSETFROM:${formatUtcOffset(january)}`,
          `TZOFFSETTO:${formatUtcOffset(january)}`,
          "END:STANDARD",
        ]
      : findOffsetTransitions(timezone, referenceYear).flatMap(observanceLines);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${timezone}`, ...observances, "END:VTIMEZONE"];
  VTIMEZONE_CACHE.set(cacheKey, lines);
  return lines;
}

/** A series or override keeps its wall-clock zone so other clients expand it across DST; every other timed event stays in UTC. */
function seriesTimezoneId(
  event: Pick<IcsBuildEventInput, "allDay" | "recurrence" | "recurrenceId" | "timezone">,
  calendarTimezone?: string,
): string | undefined {
  if (event.allDay || (!event.recurrence && !event.recurrenceId)) {
    return undefined;
  }
  const timezone = normalizeIcsTimezone(event.timezone ?? calendarTimezone);
  if (!timezone || timezone === "UTC") {
    return undefined;
  }
  try {
    getDateTimePartsFormatter(timezone);
    return timezone;
  } catch {
    return undefined;
  }
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

  const allDayTimezone =
    normalizeIcsTimezone(event.timezone ?? calendarTimezone) || "UTC";
  const tzid = seriesTimezoneId(event, calendarTimezone);
  const dateProperty = (name: string, dates: Date[]): string => {
    if (allDay) {
      return `${name};VALUE=DATE:${dates.map((date) => formatDateStampInTimeZone(date, allDayTimezone)).join(",")}`;
    }
    if (tzid) {
      return `${name};TZID=${tzid}:${dates.map((date) => formatLocalDateTimeStamp(date, tzid)).join(",")}`;
    }
    return `${name}:${dates.map(formatDateTimeStamp).join(",")}`;
  };

  lines.push(dateProperty("DTSTART", [start]));
  lines.push(
    allDay
      ? `DTEND;VALUE=DATE:${addDaysToDateStamp(formatDateStampInTimeZone(end, allDayTimezone), 1)}`
      : dateProperty("DTEND", [end]),
  );

  if (event.recurrenceId && !Number.isNaN(event.recurrenceId.getTime())) {
    lines.push(dateProperty("RECURRENCE-ID", [event.recurrenceId]));
  }

  if (event.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description.trim())}`);
  }

  if (event.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
  }

  const organizer = event.participants?.find(
    (participant) => participant.role === "organizer" && participant.email.trim(),
  );
  if (organizer) {
    const organizerParams = organizer.displayName?.trim()
      ? `;CN=${escapeIcsParamValue(organizer.displayName.trim())}`
      : "";
    lines.push(
      `ORGANIZER${organizerParams}:mailto:${sanitizeIcsUri(organizer.email.trim())}`,
    );
  }

  for (const participant of event.participants ?? []) {
    const email = participant.email.trim();
    if (!email || participant.role === "organizer") {
      continue;
    }

    const attendeeParams: string[] = [];
    if (participant.displayName?.trim()) {
      attendeeParams.push(
        `CN=${escapeIcsParamValue(participant.displayName.trim())}`,
      );
    }

    if (participant.status === "accepted") {
      attendeeParams.push("PARTSTAT=ACCEPTED");
    } else if (participant.status === "declined") {
      attendeeParams.push("PARTSTAT=DECLINED");
    } else if (participant.status === "tentative") {
      attendeeParams.push("PARTSTAT=TENTATIVE");
    } else {
      attendeeParams.push("PARTSTAT=NEEDS-ACTION");
      attendeeParams.push("RSVP=TRUE");
    }

    lines.push(
      `ATTENDEE${attendeeParams.length ? `;${attendeeParams.join(";")}` : ""}:mailto:${sanitizeIcsUri(email)}`,
    );
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
    const exceptionDates = (event.exceptionDates ?? []).filter(
      (date) => !Number.isNaN(date.getTime()),
    );
    if (exceptionDates.length) {
      lines.push(dateProperty("EXDATE", exceptionDates));
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

  const timezoneIds = new Set(
    options.events.flatMap(
      (event) => seriesTimezoneId(event, options.calendar.timezone) ?? [],
    ),
  );
  for (const timezone of timezoneIds) {
    lines.push(...buildVTimezoneLines(timezone, dtStamp.getUTCFullYear()));
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
