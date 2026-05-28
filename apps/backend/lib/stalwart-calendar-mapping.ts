import type { EventParticipantInput } from "@workspace/calendar-core";
import { RecurrenceEngine, type RecurrenceRule } from "./recurrence";
import type { StalwartCalendarEventRecord } from "./stalwart-calendar";

const ENCRYPTED_EVENT_PLACEHOLDER_TITLE = "Encrypted event";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ResolvedStalwartParticipant = EventParticipantInput & {
  email: string;
};

export type StalwartEventPayloadInput = {
  calendarId: string;
  uid: string;
  title: string;
  description?: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string;
  location?: string | null;
  recurrence?: string | null;
  reminder?: number | null;
  participants?: ResolvedStalwartParticipant[];
};

export type SolaceEventFieldsFromStalwart = {
  stalwartEventId: string;
  stalwartUid: string | null;
  stalwartCalendarId: string | null;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string;
  location: string | null;
  recurrence: string | null;
  reminder: number | null;
};

function getFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: normalizeJmapTimezone(timezone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  }
}

function parseDateParts(date: Date, timezone: string): DateParts {
  const parts = getFormatter(timezone).formatToParts(date);
  const byType: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};

  for (const part of parts) {
    if (part.type === "literal") continue;
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

function partsToTimestamp(parts: DateParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function parseLocalDateTime(value: string): DateParts | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
}

function formatNumber(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatJmapDate(date: Date, timezone: string): string {
  const parts = parseDateParts(date, timezone);
  return `${parts.year}-${formatNumber(parts.month)}-${formatNumber(parts.day)}`;
}

function formatJmapLocalDateTime(date: Date, timezone: string): string {
  const parts = parseDateParts(date, timezone);
  return `${parts.year}-${formatNumber(parts.month)}-${formatNumber(parts.day)}T${formatNumber(parts.hour)}:${formatNumber(parts.minute)}:${formatNumber(parts.second)}`;
}

function jmapLocalDateTimeToDate(value: string, timezone: string): Date {
  if (value.endsWith("Z")) {
    return new Date(value);
  }

  const target = parseLocalDateTime(value);
  if (!target) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }

  const normalizedTimezone = normalizeJmapTimezone(timezone);
  let guess = new Date(partsToTimestamp(target));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = parseDateParts(guess, normalizedTimezone);
    const delta = partsToTimestamp(target) - partsToTimestamp(actual);
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }

  return guess;
}

function toIsoDuration(start: Date, end: Date, allDay: boolean): string {
  const durationMs = Math.max(end.getTime() - start.getTime(), 60_000);
  if (allDay) {
    const days = Math.max(1, Math.round(durationMs / 86_400_000));
    return `P${days}D`;
  }

  const totalSeconds = Math.max(60, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds ? `${seconds}S` : ""}`;
}

function parseIsoDuration(value: string | null | undefined): number {
  if (!value) return 60 * 60 * 1000;
  const match = value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!match) return 60 * 60 * 1000;

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return (
    days * 86_400_000 + hours * 3_600_000 + minutes * 60_000 + seconds * 1000
  );
}

function isAllDayJsCalendarEvent(event: StalwartCalendarEventRecord): boolean {
  if (typeof event.start === "string" && !event.start.includes("T")) {
    return true;
  }

  if (typeof event.duration === "string") {
    return /^P(?!T)/i.test(event.duration);
  }

  return false;
}

function buildRecurrenceRule(recurrence?: string | null) {
  if (!recurrence) return undefined;
  const rule = RecurrenceEngine.parseRecurrenceRule(recurrence);
  if (!rule) return undefined;

  const jmapRule: Record<string, unknown> = {
    frequency: rule.frequency,
  };
  if (rule.interval && rule.interval !== 1) jmapRule.interval = rule.interval;
  if (rule.count) jmapRule.count = rule.count;
  if (rule.until) {
    jmapRule.until = formatJmapLocalDateTime(
      rule.until,
      rule.timezone ?? "UTC",
    );
  }
  if (rule.byWeekDay?.length) {
    jmapRule.byDay = rule.byWeekDay.map((day) => ({
      day: ["su", "mo", "tu", "we", "th", "fr", "sa"][day] ?? "mo",
    }));
  }
  if (rule.byMonthDay?.length) jmapRule.byMonthDay = rule.byMonthDay;
  if (rule.byMonth?.length) jmapRule.byMonth = rule.byMonth;

  return jmapRule;
}

function parseRecurrenceRule(
  rule: Record<string, unknown> | null | undefined,
  timezone: string,
): string | null {
  if (!rule || typeof rule.frequency !== "string") return null;
  const frequency = rule.frequency.toLowerCase();
  if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
    return null;
  }

  const recurrence: RecurrenceRule = {
    frequency: frequency as RecurrenceRule["frequency"],
    interval: typeof rule.interval === "number" ? rule.interval : 1,
    timezone,
  };
  if (typeof rule.count === "number") recurrence.count = rule.count;
  if (typeof rule.until === "string") {
    recurrence.until = jmapLocalDateTimeToDate(rule.until, timezone);
  }
  if (Array.isArray(rule.byDay)) {
    const days = ["su", "mo", "tu", "we", "th", "fr", "sa"];
    recurrence.byWeekDay = rule.byDay
      .map((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "day" in entry &&
        typeof entry.day === "string"
          ? days.indexOf(entry.day.toLowerCase())
          : -1,
      )
      .filter((day) => day >= 0);
  }
  if (Array.isArray(rule.byMonthDay)) {
    recurrence.byMonthDay = rule.byMonthDay.filter(
      (day): day is number => typeof day === "number",
    );
  }
  if (Array.isArray(rule.byMonth)) {
    recurrence.byMonth = rule.byMonth.filter(
      (month): month is number => typeof month === "number",
    );
  }

  return RecurrenceEngine.createRecurrenceRule(recurrence);
}

function buildParticipants(participants: ResolvedStalwartParticipant[] = []) {
  const entries = participants
    .filter((participant) => participant.email.trim())
    .map((participant, index) => {
      const role = participant.role === "organizer" ? "chair" : "attendee";
      const status =
        participant.role === "organizer"
          ? "accepted"
          : participant.status === "pending"
            ? "needs-action"
            : participant.status || "needs-action";

      return [
        `p${index}`,
        {
          "@type": "Participant",
          calendarAddress: `mailto:${participant.email.trim().toLowerCase()}`,
          name: participant.displayName?.trim() || participant.email,
          roles: {
            [role]: true,
          },
          participationStatus: status,
        },
      ] as const;
    });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parseParticipantEmail(calendarAddress: unknown): string | null {
  if (typeof calendarAddress !== "string") {
    return null;
  }

  const normalized = calendarAddress
    .trim()
    .replace(/^mailto:/i, "")
    .trim();
  return normalized ? normalized.toLowerCase() : null;
}

function parseParticipantRole(roles: unknown): "organizer" | "attendee" {
  if (roles && typeof roles === "object" && "chair" in roles) {
    return "organizer";
  }

  return "attendee";
}

function parseParticipantStatus(
  status: unknown,
): EventParticipantInput["status"] {
  if (typeof status !== "string") {
    return "pending";
  }

  switch (status.toLowerCase()) {
    case "accepted":
      return "accepted";
    case "declined":
      return "declined";
    case "tentative":
      return "tentative";
    case "needs-action":
    default:
      return "pending";
  }
}

function firstCalendarId(calendarIds?: Record<string, boolean | null>) {
  if (!calendarIds) return null;
  return (
    Object.entries(calendarIds).find(([, isInCalendar]) => isInCalendar)?.[0] ??
    null
  );
}

function firstLocationName(
  locations?: StalwartCalendarEventRecord["locations"],
): string | null {
  if (!locations) return null;
  for (const location of Object.values(locations)) {
    const name = location?.name?.trim();
    if (name) return name;
  }
  return null;
}

function firstReminderMinutes(
  alerts?: StalwartCalendarEventRecord["alerts"],
): number | null {
  if (!alerts) return null;
  for (const alert of Object.values(alerts)) {
    const offset = alert?.trigger?.offset;
    if (!offset?.startsWith("-PT")) continue;
    const minutes = offset.match(/-PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!minutes) continue;
    return Number(minutes[1] ?? 0) * 60 + Number(minutes[2] ?? 0);
  }
  return null;
}

export function normalizeJmapTimezone(timezone?: string | null): string {
  if (!timezone || timezone === "UTC") {
    return "Etc/UTC";
  }
  return timezone;
}

export function normalizeSolaceTimezone(timezone?: string | null): string {
  if (!timezone || timezone === "Etc/UTC") {
    return "UTC";
  }
  return timezone;
}

export function buildStalwartEventPayload(
  input: StalwartEventPayloadInput,
): Record<string, unknown> {
  const timezone = normalizeJmapTimezone(input.timezone);
  const title = input.title.trim() || ENCRYPTED_EVENT_PLACEHOLDER_TITLE;
  const locations = input.location?.trim()
    ? {
        primary: {
          "@type": "Location",
          name: input.location.trim(),
        },
      }
    : undefined;
  const reminder =
    input.reminder && input.reminder > 0
      ? {
          default: {
            "@type": "Alert",
            action: "display",
            trigger: {
              "@type": "OffsetTrigger",
              relativeTo: "start",
              offset: `-PT${input.reminder}M`,
            },
          },
        }
      : undefined;
  const participants =
    input.participants !== undefined
      ? buildParticipants(input.participants)
      : undefined;
  const recurrenceRule = buildRecurrenceRule(input.recurrence);

  return {
    "@type": "Event",
    calendarIds: {
      [input.calendarId]: true,
    },
    uid: input.uid,
    title,
    description: input.description?.trim() || null,
    start: input.allDay
      ? formatJmapDate(input.start, timezone)
      : formatJmapLocalDateTime(input.start, timezone),
    duration: toIsoDuration(input.start, input.end, input.allDay),
    timeZone: timezone,
    ...(locations ? { locations } : { locations: null }),
    ...(reminder ? { alerts: reminder } : { alerts: null }),
    ...(input.participants !== undefined
      ? participants
        ? { participants }
        : { participants: null }
      : {}),
    ...(recurrenceRule ? { recurrenceRule } : { recurrenceRule: null }),
  };
}

export function mapStalwartEventToSolace(
  event: StalwartCalendarEventRecord,
): SolaceEventFieldsFromStalwart {
  const timezone = normalizeSolaceTimezone(event.timeZone);
  const start = event.start
    ? jmapLocalDateTimeToDate(event.start, timezone)
    : new Date(0);
  const durationMs = parseIsoDuration(event.duration);

  return {
    stalwartEventId: event.id,
    stalwartUid: event.uid ?? null,
    stalwartCalendarId: firstCalendarId(event.calendarIds),
    title: event.title?.trim() || ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
    description: event.description?.trim() || null,
    start,
    end: new Date(start.getTime() + durationMs),
    allDay: isAllDayJsCalendarEvent(event),
    timezone,
    location: firstLocationName(event.locations),
    recurrence: parseRecurrenceRule(event.recurrenceRule, timezone),
    reminder: firstReminderMinutes(event.alerts),
  };
}

export function mapStalwartParticipantsToSolace(
  participants: StalwartCalendarEventRecord["participants"],
): EventParticipantInput[] {
  if (!participants) {
    return [];
  }

  return Object.values(participants).flatMap((participant) => {
    const email = parseParticipantEmail(participant?.calendarAddress);
    if (!email) {
      return [];
    }

    return [
      {
        email,
        displayName:
          typeof participant?.name === "string" && participant.name.trim()
            ? participant.name.trim()
            : undefined,
        role: parseParticipantRole(participant?.roles),
        status: parseParticipantStatus(participant?.participationStatus),
      },
    ];
  });
}
