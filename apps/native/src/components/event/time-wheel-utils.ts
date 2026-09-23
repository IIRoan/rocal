export type TimeFormat = "12h" | "24h";

export const WHEEL_HOURS_24 = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
export const WHEEL_HOURS_12 = Array.from({ length: 12 }, (_, i) =>
  String(i === 0 ? 12 : i),
);
export const WHEEL_MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);
export const WHEEL_MERIDIEMS = ["AM", "PM"];

export interface TimeWheelIndexes {
  hourIndex: number;
  minuteIndex: number;
  meridiemIndex: number;
}

export function timeToWheelIndexes(
  hours: number,
  minutes: number,
  timeFormat: TimeFormat,
): TimeWheelIndexes {
  if (timeFormat === "24h") {
    return { hourIndex: hours, minuteIndex: minutes, meridiemIndex: 0 };
  }
  return {
    hourIndex: hours % 12,
    minuteIndex: minutes,
    meridiemIndex: hours >= 12 ? 1 : 0,
  };
}

export function wheelIndexesToTime(
  { hourIndex, minuteIndex, meridiemIndex }: TimeWheelIndexes,
  timeFormat: TimeFormat,
): { hours: number; minutes: number } {
  const hours =
    timeFormat === "24h" ? hourIndex : hourIndex + (meridiemIndex === 1 ? 12 : 0);
  return { hours, minutes: minuteIndex };
}

export function formatPickerTime(date: Date, timeFormat: TimeFormat): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (timeFormat === "24h") {
    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

/** Nearest wheel row for a scroll offset, clamped to the list. */
export function wheelIndexFromOffset(
  offset: number,
  itemHeight: number,
  count: number,
): number {
  "worklet";
  return Math.min(count - 1, Math.max(0, Math.round(offset / itemHeight)));
}

const MIN_LOOPED_ROWS = 400;

/** Odd number of repeated cycles so a looping wheel has room for long flings in both directions. */
export function wheelCycles(count: number, loop: boolean): number {
  if (!loop) return 1;
  const cycles = Math.ceil(MIN_LOOPED_ROWS / count);
  return cycles % 2 === 0 ? cycles + 1 : cycles;
}

export function wheelValueAt(rawIndex: number, count: number): number {
  "worklet";
  return ((rawIndex % count) + count) % count;
}

export function middleRawIndex(
  value: number,
  count: number,
  cycles: number,
): number {
  return Math.floor(cycles / 2) * count + value;
}

export function isInMiddleCycle(
  rawIndex: number,
  count: number,
  cycles: number,
): boolean {
  return Math.floor(rawIndex / count) === Math.floor(cycles / 2);
}

/** Row showing `value` that is the fewest rows away from `rawIndex`, so outside changes take the short way round. */
export function nearestRawIndex(
  rawIndex: number,
  value: number,
  count: number,
  loop: boolean,
): number {
  if (!loop) return value;
  let delta = value - wheelValueAt(rawIndex, count);
  if (delta > count / 2) delta -= count;
  if (delta < -count / 2) delta += count;
  return rawIndex + delta;
}

const WHEEL_ROW_ANGLE = Math.PI / 9;
const WHEEL_MAX_ROWS = 4.5;

/** Cylinder projection for a row `distance` rows from the centre, like a physical picker drum. */
export function wheelRowProjection(
  distance: number,
  itemHeight: number,
): { rotateX: number; translateY: number; opacity: number } {
  "worklet";
  const clamped = Math.max(-WHEEL_MAX_ROWS, Math.min(WHEEL_MAX_ROWS, distance));
  const angle = clamped * WHEEL_ROW_ANGLE;
  const radius = itemHeight / WHEEL_ROW_ANGLE;
  const absDistance = Math.abs(distance);
  const depthFade = Math.max(0, Math.cos(angle)) ** 1.5;
  const centerFade = 1 - 0.35 * Math.min(1, absDistance);
  return {
    rotateX: (angle * 180) / Math.PI,
    translateY: distance * itemHeight - radius * Math.sin(angle),
    opacity: absDistance >= WHEEL_MAX_ROWS - 0.5 ? 0 : depthFade * centerFade,
  };
}
