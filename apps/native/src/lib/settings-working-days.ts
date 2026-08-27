const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

function parseWorkingDayValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6
      ? parsed
      : null;
  }

  return null;
}

/** Parse persisted working days into a Set, supporting both JSON and legacy CSV. */
export function parseWorkingDays(workingDays: string): Set<number> {
  if (!workingDays) return new Set(DEFAULT_WORKING_DAYS);

  try {
    const parsed = JSON.parse(workingDays);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed.map(parseWorkingDayValue).filter((n): n is number => n !== null),
      );
    }
  } catch {
    // Fall through to legacy CSV parsing.
  }

  return new Set(
    workingDays
      .split(",")
      .map(parseWorkingDayValue)
      .filter((n): n is number => n !== null),
  );
}

/** Serialize working days to the same JSON shape the web client uses. */
export function serializeWorkingDays(days: Set<number>): string {
  return JSON.stringify(Array.from(days).sort((a, b) => a - b));
}

/** Format a set of working days to a short readable label. */
export function formatWorkingDaysLabel(daysSet: Set<number>): string {
  const count = daysSet.size;
  if (count === 0) return "None";
  if (count === 7) return "Every day";
  if (count === 5 && !daysSet.has(0) && !daysSet.has(6)) return "Mon – Fri";
  return `${count} day${count !== 1 ? "s" : ""}`;
}
