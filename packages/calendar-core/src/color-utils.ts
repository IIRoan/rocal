export const CALENDAR_COLORS = [
  "blue",
  "orange",
  "violet",
  "rose",
  "emerald",
  "red",
  "cyan",
  "lime",
  "amber",
  "indigo",
  "pink",
  "teal",
] as const;

export type CalendarColorName = (typeof CALENDAR_COLORS)[number];

export interface PresetColorOption {
  value: CalendarColorName;
  label: string;
}

export const PRESET_COLOR_OPTIONS: readonly PresetColorOption[] = [
  { value: "blue", label: "Blue" },
  { value: "emerald", label: "Emerald" },
  { value: "orange", label: "Orange" },
  { value: "violet", label: "Violet" },
  { value: "rose", label: "Rose" },
  { value: "red", label: "Red" },
  { value: "cyan", label: "Cyan" },
  { value: "lime", label: "Lime" },
  { value: "amber", label: "Amber" },
  { value: "indigo", label: "Indigo" },
  { value: "pink", label: "Pink" },
  { value: "teal", label: "Teal" },
];

export const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const CALENDAR_COLOR_SET = new Set<string>(CALENDAR_COLORS);

export function isHexColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

export function isNamedCalendarColor(
  color: string,
): color is CalendarColorName {
  return CALENDAR_COLOR_SET.has(color);
}

export function isValidCalendarColor(color: string): boolean {
  return isHexColor(color) || isNamedCalendarColor(color);
}
