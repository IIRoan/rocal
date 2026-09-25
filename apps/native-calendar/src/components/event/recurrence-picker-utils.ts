import {
  RecurrenceEngine,
  type RecurrenceFrequency,
  type RecurrenceRule,
} from "@workspace/calendar-core";

export type EndCondition = "never" | "count" | "until";

const BYDAY_REVERSE: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export interface ParsedRule {
  frequency: RecurrenceFrequency;
  interval: number;
  byDay: number[];
  endCondition: EndCondition;
  count: number;
  until: string;
}

/** Parse an RRULE string; null for empty input or an unrecognised FREQ. */
export function parseRRule(rrule: string | null): ParsedRule | null {
  if (!rrule) return null;

  const parts = rrule.split(";");
  const map = new Map<string, string>();
  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key && val) map.set(key, val);
  }

  const freqStr = map.get("FREQ")?.toLowerCase();
  if (
    freqStr !== "daily" &&
    freqStr !== "weekly" &&
    freqStr !== "monthly" &&
    freqStr !== "yearly"
  ) {
    return null;
  }

  const frequency = freqStr as RecurrenceFrequency;
  const interval = parseInt(map.get("INTERVAL") ?? "1", 10) || 1;

  const byDayStr = map.get("BYDAY");
  const byDay = byDayStr
    ? byDayStr
        .split(",")
        .map((d) => BYDAY_REVERSE[d.trim()])
        .filter((d): d is number => d !== undefined)
    : [];

  let endCondition: EndCondition = "never";
  let count = 10;
  let until = "";

  if (map.has("COUNT")) {
    endCondition = "count";
    count = parseInt(map.get("COUNT")!, 10) || 10;
  } else if (map.has("UNTIL")) {
    endCondition = "until";
    until = map.get("UNTIL")!;
  }

  return { frequency, interval, byDay, endCondition, count, until };
}

function parseRRuleUntil(until: string): Date | undefined {
  const match = until.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Read a stored recurrence (JSON rule, or a legacy RRULE string written by older native builds). */
export function parseStoredRecurrence(
  raw: string | null | undefined,
): RecurrenceRule | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    return RecurrenceEngine.parseRecurrenceRule(trimmed);
  }

  const legacy = parseRRule(trimmed);
  if (!legacy) return null;
  const until =
    legacy.endCondition === "until" ? parseRRuleUntil(legacy.until) : undefined;
  return {
    frequency: legacy.frequency,
    interval: legacy.interval,
    ...(legacy.byDay.length > 0 ? { byWeekDay: legacy.byDay } : {}),
    ...(legacy.endCondition === "count" ? { count: legacy.count } : {}),
    ...(until ? { until } : {}),
  };
}
