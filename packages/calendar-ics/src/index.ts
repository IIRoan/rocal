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

export type CalendarMethodType = (typeof CALENDAR_METHOD_TYPES)[number];

export const DEFAULT_CALENDAR_METHOD: CalendarMethodType = "PUBLISH";

const CALENDAR_METHOD_SET = new Set<string>(CALENDAR_METHOD_TYPES);

export function isCalendarMethodType(value: string): value is CalendarMethodType {
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

export function normalizeIcsTimezone(timezone?: string | null): string | undefined {
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
  name?: string;
  url: string;
  calendarId: string;
}

export interface UpdateCalendarSubscriptionRequest {
  name?: string;
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

export type {
  RecurrenceFrequency,
  RecurrenceInstance,
  RecurrenceRule,
} from "./recurrence";
