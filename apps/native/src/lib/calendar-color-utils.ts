import type { CalendarColor, ThemeTokens } from "@workspace/design-tokens";
import { CALENDAR_COLORS } from "../components/event/color-picker-utils";

const HEX_COLOR_PATTERN = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const VALID_NAMED_COLORS = new Set<string>(CALENDAR_COLORS);

export function isNamedCalendarColor(value: string): value is CalendarColor {
  return VALID_NAMED_COLORS.has(value);
}

export function isValidCalendarColorValue(value: string): boolean {
  const trimmed = value.trim();
  return isNamedCalendarColor(trimmed) || HEX_COLOR_PATTERN.test(trimmed);
}

export function resolveCalendarSwatchColor(
  value: string | null | undefined,
  theme: ThemeTokens,
): string {
  const color = value?.trim();

  if (!color) {
    return theme.colors.calendar.blue.bg;
  }

  if (isNamedCalendarColor(color)) {
    return theme.colors.calendar[color].bg;
  }

  if (HEX_COLOR_PATTERN.test(color)) {
    return color;
  }

  return theme.colors.calendar.blue.bg;
}

export interface ResolvedEventColor {
  bg: string;
  fg: string;
}

export function resolveEventBlockColor(
  eventColor: string | undefined,
  theme: ThemeTokens,
): ResolvedEventColor {
  if (eventColor && isNamedCalendarColor(eventColor)) {
    const palette = theme.colors.calendar[eventColor];
    return { bg: palette.bg, fg: palette.fg };
  }
  if (eventColor && HEX_COLOR_PATTERN.test(eventColor)) {
    return { bg: eventColor, fg: theme.colors.foreground };
  }
  if (eventColor) {
    return { bg: eventColor, fg: theme.colors.foreground };
  }
  return { bg: theme.colors.muted, fg: theme.colors.mutedForeground };
}
