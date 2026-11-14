import { addDays } from "date-fns";

import type { TimeFormat } from "./time-format";
import { clockTimePattern } from "./time-format";
import {
  comparePickerDays,
  formatInUserTimezone,
  formatInstantCalendarDayKey,
  pickerDateToAllDayUtcRange,
  utcToPickerDate,
  wallClockToUtc,
} from "./timezone";

export type QuickAddResult = { title: string; start: Date; end: Date; allDay: boolean };

export type QuickAddOptions = { now: Date; timezone: string; defaultDurationMinutes: number };

/** Titles are capped at 255 characters, so longer text is never parsed on each keystroke. */
const QUICK_ADD_MAX_LENGTH = 255;

type Span = { start: number; end: number };
type ClockTime = { hours: number; minutes: number };
type RawTime = { hour: string; minute?: string; meridiem?: string };

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const alternation = (table: Record<string, number>) =>
  Object.keys(table)
    .sort((left, right) => right.length - left.length)
    .join("|");

const WEEKDAY = alternation(WEEKDAYS);
const MONTH = alternation(MONTHS);
const DAY_OF_MONTH = "(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*(?:am|pm|:))";
const YEAR = "(?:,?\\s+(\\d{4})\\b)?";
const TIME = "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?";

const ALL_DAY_RE = /\ball[- ]day\b/gi;
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/gi;
const DAY_MONTH_RE = new RegExp(
  `\\b${DAY_OF_MONTH}(?:\\s+of)?\\s+(${MONTH})\\b\\.?${YEAR}`,
  "gi",
);
const MONTH_DAY_RE = new RegExp(`\\b(${MONTH})\\.?\\s+${DAY_OF_MONTH}${YEAR}`, "gi");
const RELATIVE_DAY_RE = /\b(today|tonight|tomorrow|tmrw)\b/gi;
const WEEKDAY_RE = new RegExp(`\\b(?:(next|this)\\s+)?(${WEEKDAY})\\b`, "gi");
const IN_DAYS_RE = /\bin\s+(\d{1,3})\s*(days?|weeks?)\b/gi;
const IN_TIME_RE = /\bin\s+(\d{1,4})\s*(minutes?|mins?|hours?|hrs?)\b/gi;
const RANGE_RE = new RegExp(
  `(?:\\b(from)\\s+)?\\b${TIME}\\s*(?:-|–|—|\\bto\\b|\\buntil\\b|\\btill\\b)\\s*${TIME}\\b`,
  "gi",
);
const DURATION_RE = /\bfor\s+(\d{1,3}(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/gi;
const MERIDIEM_TIME_RE = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;
const CLOCK_TIME_RE = /\b(?:at\s+)?(\d{1,2}):(\d{2})\b/gi;
const NAMED_TIME_RE = /\b(?:at\s+)?(noon|midnight)\b/gi;
const BARE_AT_TIME_RE = /\bat\s+(\d{1,2})\b(?!\s*[:.]\d)/gi;

const TONIGHT_DEFAULT: ClockTime = { hours: 19, minutes: 0 };
const NOON: ClockTime = { hours: 12, minutes: 0 };
const MIDNIGHT: ClockTime = { hours: 0, minutes: 0 };

/** Finds the first match outside claimed spans that `accept` turns into a value, and claims it. */
function claim<T>(
  input: string,
  spans: Span[],
  pattern: RegExp,
  accept: (match: RegExpExecArray) => T | null,
): T | null {
  pattern.lastIndex = 0;
  for (let match = pattern.exec(input); match; match = pattern.exec(input)) {
    const span = { start: match.index, end: match.index + match[0].length };
    const free = spans.every((taken) => taken.end <= span.start || span.end <= taken.start);
    const value = free ? accept(match) : null;
    if (value !== null) {
      spans.push(span);
      return value;
    }
  }
  return null;
}

function validDay(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function upcomingDay(today: Date, month: number, day: number, year?: string): Date | null {
  if (year) return validDay(Number(year), month, day);
  const thisYear = validDay(today.getFullYear(), month, day);
  if (thisYear && comparePickerDays(thisYear, today) >= 0) return thisYear;
  return validDay(today.getFullYear() + 1, month, day);
}

/** Without am/pm, 1–7 reads as afternoon (a heuristic); a leading zero means the 24-hour clock. */
function resolveTime(raw: RawTime, meridiem = raw.meridiem): ClockTime | null {
  const hours = Number(raw.hour);
  const minutes = raw.minute ? Number(raw.minute) : 0;
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    return { hours: (hours % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0), minutes };
  }
  if (hours > 23) return null;
  const afternoon = hours >= 1 && hours <= 7 && !raw.hour.startsWith("0");
  return { hours: afternoon ? hours + 12 : hours, minutes };
}

const toMinutes = (time: ClockTime) => time.hours * 60 + time.minutes;

function resolveRange(startRaw: RawTime, endRaw: RawTime): [ClockTime, ClockTime] | null {
  const end = resolveTime(endRaw);
  let start = resolveTime(startRaw);
  if (!start || !end) return null;
  if (!startRaw.meridiem && endRaw.meridiem) {
    const inherited = resolveTime(startRaw, endRaw.meridiem);
    if (inherited && toMinutes(inherited) <= toMinutes(end)) start = inherited;
  }
  if (!endRaw.meridiem && toMinutes(end) <= toMinutes(start) && end.hours < 12) {
    const evening = { hours: end.hours + 12, minutes: end.minutes };
    if (toMinutes(evening) > toMinutes(start)) return [start, evening];
  }
  return [start, end];
}

function rawTime(hour?: string, minute?: string, meridiem?: string): RawTime | null {
  return hour ? { hour, minute, meridiem } : null;
}

function claimCalendarDay(input: string, spans: Span[], today: Date): Date | null {
  return (
    claim(input, spans, ISO_DATE_RE, (match) =>
      validDay(Number(match[1]), Number(match[2]), Number(match[3])),
    ) ??
    claim(input, spans, DAY_MONTH_RE, (match) =>
      upcomingDay(today, MONTHS[(match[2] ?? "").toLowerCase()] ?? 0, Number(match[1]), match[3]),
    ) ??
    claim(input, spans, MONTH_DAY_RE, (match) =>
      upcomingDay(today, MONTHS[(match[1] ?? "").toLowerCase()] ?? 0, Number(match[2]), match[3]),
    ) ??
    claim(input, spans, WEEKDAY_RE, (match) => {
      const target = WEEKDAYS[(match[2] ?? "").toLowerCase()] ?? 0;
      const ahead = (target - today.getDay() + 7) % 7;
      const strictlyAfter = (match[1] ?? "").toLowerCase() === "next";
      return addDays(today, strictlyAfter && ahead === 0 ? 7 : ahead);
    }) ??
    claim(input, spans, IN_DAYS_RE, (match) => {
      const weeks = (match[2] ?? "").toLowerCase().startsWith("week");
      return addDays(today, Number(match[1]) * (weeks ? 7 : 1));
    })
  );
}

function claimClockTime(input: string, spans: Span[]): ClockTime | null {
  const resolveMatch = (match: RegExpExecArray, meridiemGroup?: number) => {
    const raw = rawTime(match[1], match[2], meridiemGroup ? match[meridiemGroup] : undefined);
    return raw ? resolveTime(raw) : null;
  };
  return (
    claim(input, spans, MERIDIEM_TIME_RE, (match) => resolveMatch(match, 3)) ??
    claim(input, spans, CLOCK_TIME_RE, (match) => resolveMatch(match)) ??
    claim(input, spans, NAMED_TIME_RE, (match) =>
      (match[1] ?? "").toLowerCase() === "noon" ? NOON : MIDNIGHT,
    ) ??
    claim(input, spans, BARE_AT_TIME_RE, (match) => resolveMatch(match))
  );
}

function buildTitle(input: string, spans: Span[]): string {
  let title = "";
  let cursor = 0;
  for (const span of [...spans].sort((left, right) => left.start - right.start)) {
    title += `${input.slice(cursor, span.start).replace(/(^|\s)(?:at|on|from|for)\s*$/i, "$1")} `;
    cursor = span.end;
  }
  title += input.slice(cursor);
  return title.replace(/\s+/g, " ").replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "");
}

/** Parses "Lunch with Ana tomorrow 1pm" on the device; English only, null without a date or time. */
export function parseQuickAdd(input: string, options: QuickAddOptions): QuickAddResult | null {
  if (input.length > QUICK_ADD_MAX_LENGTH) return null;
  const { now, timezone, defaultDurationMinutes } = options;
  const today = utcToPickerDate(now, timezone);
  const spans: Span[] = [];

  const allDay = claim(input, spans, ALL_DAY_RE, () => true) ?? false;
  const relativeDay = claim(input, spans, RELATIVE_DAY_RE, (match) =>
    (match[1] ?? "").toLowerCase(),
  );
  const tonight = relativeDay === "tonight";
  const day = relativeDay
    ? addDays(today, relativeDay === "tomorrow" || relativeDay === "tmrw" ? 1 : 0)
    : claimCalendarDay(input, spans, today);

  const relativeStart = claim(input, spans, IN_TIME_RE, (match) => {
    const amount = Number(match[1]) * ((match[2] ?? "").toLowerCase().startsWith("h") ? 60 : 1);
    return new Date(Math.floor(now.getTime() / 60_000) * 60_000 + amount * 60_000);
  });
  const range = claim(input, spans, RANGE_RE, (match) => {
    const startRaw = rawTime(match[2], match[3], match[4]);
    const endRaw = rawTime(match[5], match[6], match[7]);
    const qualified = Boolean(match[1] || match[3] || match[4] || match[6] || match[7]);
    return startRaw && endRaw && qualified ? resolveRange(startRaw, endRaw) : null;
  });
  const durationMinutes = claim(input, spans, DURATION_RE, (match) => {
    const hours = (match[2] ?? "").toLowerCase().startsWith("h");
    const minutes = Math.round(Number(match[1]) * (hours ? 60 : 1));
    return minutes > 0 ? minutes : null;
  });
  const time = range?.[0] ?? claimClockTime(input, spans);

  if (!allDay && !day && !relativeStart && !time) return null;

  const title = buildTitle(input, spans);
  const calendarDay = day ?? today;
  if (allDay || (!time && !relativeStart && !tonight)) {
    const { start, end } = pickerDateToAllDayUtcRange(calendarDay, calendarDay, timezone);
    return { title, start, end, allDay: true };
  }
  const duration = (durationMinutes ?? defaultDurationMinutes) * 60_000;
  if (relativeStart) {
    const end = new Date(relativeStart.getTime() + duration);
    return { title, start: relativeStart, end, allDay: false };
  }

  const startTime = time ?? TONIGHT_DEFAULT;
  // Tonight means the evening, so a morning hour moves past noon.
  const evening = (clock: ClockTime) =>
    tonight && clock.hours < 12 ? { hours: clock.hours + 12, minutes: clock.minutes } : clock;
  const startClock = evening(startTime);
  const start = wallClockToUtc(calendarDay, startClock.hours, startClock.minutes, timezone);
  if (!range) {
    return { title, start, end: new Date(start.getTime() + duration), allDay: false };
  }
  const endClock = evening(range[1]);
  const overnight = toMinutes(endClock) <= toMinutes(startClock);
  const endDay = overnight ? addDays(calendarDay, 1) : calendarDay;
  return {
    title,
    start,
    end: wallClockToUtc(endDay, endClock.hours, endClock.minutes, timezone),
    allDay: false,
  };
}

/** The suggestion label both apps show, e.g. "Tue 18 Nov · 13:00–14:00". */
export function formatQuickAddSummary(
  result: QuickAddResult,
  timezone: string,
  timeFormat: TimeFormat,
): string {
  const day = formatInUserTimezone(result.start, timezone, "EEE d MMM");
  if (result.allDay) return `${day} · All day`;
  const clock = clockTimePattern(timeFormat);
  const sameDay =
    formatInstantCalendarDayKey(result.start, timezone) ===
    formatInstantCalendarDayKey(result.end, timezone);
  const end = formatInUserTimezone(result.end, timezone, sameDay ? clock : `EEE d MMM ${clock}`);
  return `${day} · ${formatInUserTimezone(result.start, timezone, clock)}–${end}`;
}
