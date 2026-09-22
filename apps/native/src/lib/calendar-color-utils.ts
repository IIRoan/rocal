import type { CalendarColor, ThemeTokens } from "@workspace/design-tokens";
import { CALENDAR_COLORS } from "../components/event/color-picker-utils";

const HEX_COLOR_PATTERN = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const VALID_NAMED_COLORS = new Set<string>(CALENDAR_COLORS);
/** Web's `--event-sky` token backs both `sky` and `blue`. */
const NAMED_COLOR_ALIASES: Record<string, CalendarColor> = { sky: "blue" };

export function isNamedCalendarColor(value: string): value is CalendarColor {
  return VALID_NAMED_COLORS.has(value);
}

export function isValidCalendarColorValue(value: string): boolean {
  const trimmed = value.trim();
  return isNamedCalendarColor(trimmed) || HEX_COLOR_PATTERN.test(trimmed);
}

function toNamedCalendarColor(value: string): CalendarColor | null {
  if (isNamedCalendarColor(value)) return value;
  return NAMED_COLOR_ALIASES[value] ?? null;
}

export function resolveCalendarSwatchColor(
  value: string | null | undefined,
  theme: ThemeTokens,
): string {
  const color = value?.trim();

  if (!color) {
    return theme.colors.calendar.blue.bg;
  }

  const named = toNamedCalendarColor(color);
  if (named) {
    return theme.colors.calendar[named].bg;
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

type Oklch = { l: number; c: number; h: number };

function expandHex(hex: string): string {
  const raw = hex.slice(1);
  return raw.length === 3
    ? raw
        .split("")
        .map((char) => char + char)
        .join("")
    : raw;
}

function hexToOklch(hex: string): Oklch {
  const raw = expandHex(hex);
  const toLinear = (offset: number) => {
    const channel = parseInt(raw.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(0);
  const g = toLinear(2);
  const b = toLinear(4);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const hue = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.sqrt(A * A + B * B), h: hue < 0 ? hue + 360 : hue };
}

function oklchToHex({ l, c, h }: Oklch): string {
  const hRad = (h * Math.PI) / 180;
  const A = c * Math.cos(hRad);
  const B = c * Math.sin(hRad);

  const l3 = Math.pow(l + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m3 = Math.pow(l - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s3 = Math.pow(l - 0.0894841775 * A - 1.291485548 * B, 3);

  const toHex = (linear: number) => {
    const srgb =
      linear <= 0.0031308
        ? 12.92 * linear
        : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
      .toString(16)
      .padStart(2, "0");
  };

  return `#${toHex(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3)}${toHex(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3)}${toHex(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)}`;
}

/** CSS `color-mix(in oklch, hex weight%, base)` with shorter-arc hue interpolation. */
export function mixHexInOklch(hex: string, weight: number, base: Oklch): string {
  const color = hexToOklch(hex);
  // Near-grey bases keep the calendar's hue; interpolating toward their nominal hue 0 tints everything pink.
  let hueDelta = base.c < 0.01 ? 0 : base.h - color.h;
  if (hueDelta > 180) hueDelta -= 360;
  if (hueDelta < -180) hueDelta += 360;
  const hue = color.h + hueDelta * (1 - weight);
  return oklchToHex({
    l: color.l * weight + base.l * (1 - weight),
    c: color.c * weight + base.c * (1 - weight),
    h: hue < 0 ? hue + 360 : hue % 360,
  });
}

function isDarkTheme(theme: ThemeTokens): boolean {
  const background = theme.colors.background;
  return HEX_COLOR_PATTERN.test(background) && hexToOklch(background).l < 0.5;
}

/** Mirrors web `.event-hex-adaptive` so custom hex calendars render as a tint, not a solid block. */
function resolveHexEventColor(hex: string, theme: ThemeTokens): ResolvedEventColor {
  if (isDarkTheme(theme)) {
    return {
      bg: mixHexInOklch(hex, 0.4, { l: 0.18, c: 0, h: 0 }),
      fg: mixHexInOklch(hex, 0.3, { l: 0.95, c: 0, h: 0 }),
    };
  }
  return {
    bg: mixHexInOklch(hex, 0.25, { l: 0.96, c: 0.005, h: 0 }),
    fg: mixHexInOklch(hex, 0.85, { l: 0.15, c: 0, h: 0 }),
  };
}

export function resolveEventBlockColor(
  eventColor: string | undefined,
  theme: ThemeTokens,
): ResolvedEventColor {
  const color = eventColor?.trim();
  if (color && HEX_COLOR_PATTERN.test(color)) {
    return resolveHexEventColor(color, theme);
  }
  const named = color ? toNamedCalendarColor(color) : null;
  return theme.colors.calendar[named ?? "blue"];
}
