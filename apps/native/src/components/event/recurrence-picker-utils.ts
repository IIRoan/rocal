import type { RecurrenceFrequency } from "@workspace/calendar-core";

// ─── Constants ───────────────────────────────────────────────────────────────

export const FREQUENCY_OPTIONS: readonly {
  value: RecurrenceFrequency | "none";
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export const WEEKDAYS: readonly {
  value: number;
  label: string;
  short: string;
}[] = [
  { value: 0, label: "Sunday", short: "Su" },
  { value: 1, label: "Monday", short: "Mo" },
  { value: 2, label: "Tuesday", short: "Tu" },
  { value: 3, label: "Wednesday", short: "We" },
  { value: 4, label: "Thursday", short: "Th" },
  { value: 5, label: "Friday", short: "Fr" },
  { value: 6, label: "Saturday", short: "Sa" },
];

export type EndCondition = "never" | "count" | "until";

// ─── RRULE Helpers ───────────────────────────────────────────────────────────

const BYDAY_MAP: Record<number, string> = {
  0: "SU",
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
  6: "SA",
};

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

/**
 * Parse an RRULE string into a structured object.
 * Returns null if the input is null, empty, or has an unrecognised FREQ.
 */
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

/**
 * Build an RRULE string from a structured object.
 */
export function buildRRule(parsed: ParsedRule): string {
  const parts: string[] = [`FREQ=${parsed.frequency.toUpperCase()}`];

  if (parsed.interval > 1) {
    parts.push(`INTERVAL=${parsed.interval}`);
  }

  if (parsed.frequency === "weekly" && parsed.byDay.length > 0) {
    const days = parsed.byDay
      .sort((a, b) => a - b)
      .map((d) => BYDAY_MAP[d])
      .filter(Boolean);
    if (days.length > 0) {
      parts.push(`BYDAY=${days.join(",")}`);
    }
  }

  if (parsed.endCondition === "count" && parsed.count > 0) {
    parts.push(`COUNT=${parsed.count}`);
  } else if (parsed.endCondition === "until" && parsed.until) {
    parts.push(`UNTIL=${parsed.until}`);
  }

  return parts.join(";");
}
