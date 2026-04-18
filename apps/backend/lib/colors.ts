/**
 * Shared calendar color constants and validation.
 *
 * Named colors map to CSS custom properties that adapt automatically
 * to light/dark mode. Hex colors are also accepted for custom colors.
 */
export const ALLOWED_CALENDAR_COLORS = [
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

export type AllowedCalendarColor = (typeof ALLOWED_CALENDAR_COLORS)[number];

export const isHexCalendarColor = (value: string) =>
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);

export const isValidCalendarColor = (value: string) =>
  ALLOWED_CALENDAR_COLORS.includes(value as AllowedCalendarColor) ||
  isHexCalendarColor(value);
