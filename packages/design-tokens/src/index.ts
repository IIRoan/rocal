// ─── Type Definitions ────────────────────────────────────────────────────────

export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export interface ShadowTokenValue {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadRadius: number;
  color: string;
}

export type CalendarColor =
  | "blue"
  | "orange"
  | "violet"
  | "rose"
  | "emerald"
  | "red"
  | "cyan"
  | "lime"
  | "amber"
  | "indigo"
  | "pink"
  | "teal";

export interface CalendarColorValue {
  bg: string;
  fg: string;
}

export interface ThemeTokens {
  colors: {
    primary: ColorScale;
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    primaryBase: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    muted: string;
    mutedForeground: string;
    accent: string;
    accentForeground: string;
    destructive: string;
    destructiveForeground: string;
    border: string;
    input: string;
    ring: string;
    calendar: Record<CalendarColor, CalendarColorValue>;
  };
  spacing: Record<string, number>;
  typography: {
    fontFamily: { sans: string; mono: string };
    fontSize: Record<string, { size: number; lineHeight: number }>;
    fontWeight: Record<string, string>;
  };
  borderRadius: Record<string, number>;
  shadows: Record<string, ShadowTokenValue>;
}

// ─── Shared Values ───────────────────────────────────────────────────────────

const FONT_FAMILY_SANS =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

const FONT_FAMILY_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

const spacing: Record<string, number> = {
  "0": 0,
  "1": 4,
  "2": 8,
  "3": 12,
  "4": 16,
  "5": 20,
  "6": 24,
  "8": 32,
  "10": 40,
  "12": 48,
  "16": 64,
  "20": 80,
  "24": 96,
};

const typography: ThemeTokens["typography"] = {
  fontFamily: {
    sans: FONT_FAMILY_SANS,
    mono: FONT_FAMILY_MONO,
  },
  fontSize: {
    xs: { size: 12, lineHeight: 16 },
    sm: { size: 14, lineHeight: 20 },
    base: { size: 16, lineHeight: 24 },
    lg: { size: 18, lineHeight: 28 },
    xl: { size: 20, lineHeight: 28 },
    "2xl": { size: 24, lineHeight: 32 },
    "3xl": { size: 30, lineHeight: 36 },
    "4xl": { size: 36, lineHeight: 40 },
  },
  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
};

const borderRadius: Record<string, number> = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
};

const shadows: Record<string, ShadowTokenValue> = {
  "2xs": { offsetX: 0, offsetY: 1, blurRadius: 3, spreadRadius: 0, color: "rgba(0,0,0,0.05)" },
  xs: { offsetX: 0, offsetY: 1, blurRadius: 3, spreadRadius: 0, color: "rgba(0,0,0,0.05)" },
  sm: { offsetX: 0, offsetY: 1, blurRadius: 3, spreadRadius: 0, color: "rgba(0,0,0,0.1)" },
  DEFAULT: { offsetX: 0, offsetY: 1, blurRadius: 3, spreadRadius: 0, color: "rgba(0,0,0,0.1)" },
  md: { offsetX: 0, offsetY: 2, blurRadius: 4, spreadRadius: 0, color: "rgba(0,0,0,0.1)" },
  lg: { offsetX: 0, offsetY: 4, blurRadius: 6, spreadRadius: 0, color: "rgba(0,0,0,0.1)" },
  xl: { offsetX: 0, offsetY: 8, blurRadius: 10, spreadRadius: 0, color: "rgba(0,0,0,0.1)" },
  "2xl": { offsetX: 0, offsetY: 1, blurRadius: 3, spreadRadius: 0, color: "rgba(0,0,0,0.25)" },
};

// ─── Light Theme ─────────────────────────────────────────────────────────────

export const lightTheme: ThemeTokens = {
  colors: {
    primary: {
      50: "oklch(0.98 0.005 42)",
      100: "oklch(0.95 0.01 42)",
      200: "oklch(0.90 0.02 42)",
      300: "oklch(0.80 0.03 42)",
      400: "oklch(0.65 0.035 42)",
      500: "oklch(0.4341 0.0392 41.9938)",
      600: "oklch(0.38 0.035 42)",
      700: "oklch(0.32 0.03 42)",
      800: "oklch(0.26 0.025 42)",
      900: "oklch(0.20 0.02 42)",
      950: "oklch(0.15 0.015 42)",
    },
    background: "oklch(0.9821 0 0)",
    foreground: "oklch(0.2435 0 0)",
    card: "oklch(0.9911 0 0)",
    cardForeground: "oklch(0.2435 0 0)",
    popover: "oklch(0.9911 0 0)",
    popoverForeground: "oklch(0.2435 0 0)",
    primaryBase: "oklch(0.4341 0.0392 41.9938)",
    primaryForeground: "oklch(1 0 0)",
    secondary: "oklch(0.92 0.0651 74.3695)",
    secondaryForeground: "oklch(0.3499 0.0685 40.8288)",
    muted: "oklch(0.9521 0 0)",
    mutedForeground: "oklch(0.45 0 0)",
    accent: "oklch(0.931 0 0)",
    accentForeground: "oklch(0.2435 0 0)",
    destructive: "oklch(0.6271 0.1936 33.339)",
    destructiveForeground: "oklch(1 0 0)",
    border: "oklch(0.86 0 0)",
    input: "oklch(0.8822 0 0)",
    ring: "oklch(0.4341 0.0392 41.9938)",
    calendar: {
      blue: { bg: "oklch(0.86 0.09 250)", fg: "oklch(0.28 0.12 250)" },
      orange: { bg: "oklch(0.86 0.09 65)", fg: "oklch(0.28 0.12 65)" },
      violet: { bg: "oklch(0.86 0.09 285)", fg: "oklch(0.28 0.12 285)" },
      rose: { bg: "oklch(0.86 0.09 15)", fg: "oklch(0.28 0.12 15)" },
      emerald: { bg: "oklch(0.86 0.09 150)", fg: "oklch(0.28 0.12 150)" },
      red: { bg: "oklch(0.86 0.09 30)", fg: "oklch(0.28 0.12 30)" },
      cyan: { bg: "oklch(0.86 0.09 205)", fg: "oklch(0.28 0.12 205)" },
      lime: { bg: "oklch(0.86 0.09 135)", fg: "oklch(0.28 0.12 135)" },
      amber: { bg: "oklch(0.86 0.09 85)", fg: "oklch(0.28 0.12 85)" },
      indigo: { bg: "oklch(0.86 0.09 270)", fg: "oklch(0.28 0.12 270)" },
      pink: { bg: "oklch(0.86 0.09 345)", fg: "oklch(0.28 0.12 345)" },
      teal: { bg: "oklch(0.86 0.09 175)", fg: "oklch(0.28 0.12 175)" },
    },
  },
  spacing,
  typography,
  borderRadius,
  shadows,
};

// ─── Dark Theme ──────────────────────────────────────────────────────────────

export const darkTheme: ThemeTokens = {
  colors: {
    primary: {
      50: "oklch(0.98 0.01 66)",
      100: "oklch(0.96 0.02 66)",
      200: "oklch(0.94 0.035 66)",
      300: "oklch(0.9247 0.0524 66.1732)",
      400: "oklch(0.85 0.045 66)",
      500: "oklch(0.75 0.04 66)",
      600: "oklch(0.60 0.035 66)",
      700: "oklch(0.45 0.03 66)",
      800: "oklch(0.35 0.025 66)",
      900: "oklch(0.25 0.02 66)",
      950: "oklch(0.18 0.015 66)",
    },
    background: "oklch(0.1776 0 0)",
    foreground: "oklch(0.9491 0 0)",
    card: "oklch(0.2134 0 0)",
    cardForeground: "oklch(0.9491 0 0)",
    popover: "oklch(0.2134 0 0)",
    popoverForeground: "oklch(0.9491 0 0)",
    primaryBase: "oklch(0.9247 0.0524 66.1732)",
    primaryForeground: "oklch(0.2029 0.024 200.1962)",
    secondary: "oklch(0.3163 0.019 63.6992)",
    secondaryForeground: "oklch(0.9247 0.0524 66.1732)",
    muted: "oklch(0.252 0 0)",
    mutedForeground: "oklch(0.7 0 0)",
    accent: "oklch(0.285 0 0)",
    accentForeground: "oklch(0.9491 0 0)",
    destructive: "oklch(0.6271 0.1936 33.339)",
    destructiveForeground: "oklch(1 0 0)",
    border: "oklch(0.3 0.0115 91.7467)",
    input: "oklch(0.4017 0 0)",
    ring: "oklch(0.9247 0.0524 66.1732)",
    calendar: {
      blue: { bg: "oklch(0.45 0.18 250)", fg: "oklch(0.92 0.04 250)" },
      orange: { bg: "oklch(0.45 0.18 65)", fg: "oklch(0.92 0.04 65)" },
      violet: { bg: "oklch(0.45 0.18 285)", fg: "oklch(0.92 0.04 285)" },
      rose: { bg: "oklch(0.45 0.18 15)", fg: "oklch(0.92 0.04 15)" },
      emerald: { bg: "oklch(0.45 0.18 150)", fg: "oklch(0.92 0.04 150)" },
      red: { bg: "oklch(0.45 0.18 30)", fg: "oklch(0.92 0.04 30)" },
      cyan: { bg: "oklch(0.45 0.18 205)", fg: "oklch(0.92 0.04 205)" },
      lime: { bg: "oklch(0.45 0.18 135)", fg: "oklch(0.92 0.04 135)" },
      amber: { bg: "oklch(0.45 0.18 85)", fg: "oklch(0.92 0.04 85)" },
      indigo: { bg: "oklch(0.45 0.18 270)", fg: "oklch(0.92 0.04 270)" },
      pink: { bg: "oklch(0.45 0.18 345)", fg: "oklch(0.92 0.04 345)" },
      teal: { bg: "oklch(0.45 0.18 175)", fg: "oklch(0.92 0.04 175)" },
    },
  },
  spacing,
  typography,
  borderRadius,
  shadows,
};

// ─── OKLCH → Hex Conversion (for React Native) ──────────────────────────────

/**
 * Converts an OKLCH color string to a hex color string.
 *
 * React Native does not support oklch() — only hex, rgb(), rgba(), hsl(),
 * hsla(), and named colors. This converter is used to produce native-
 * compatible theme objects.
 *
 * Algorithm: oklch → OKLab → linear-sRGB → sRGB → hex
 */
function oklchToHex(oklchStr: string): string {
  const match = oklchStr.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
  );
  if (!match) return oklchStr; // passthrough non-oklch values (e.g. rgba)

  const L = parseFloat(match[1]);
  const C = parseFloat(match[2]);
  const H = parseFloat(match[3]);

  // oklch → OKLab
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → linear sRGB
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rLin = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  // linear sRGB → sRGB (gamma)
  const toSrgb = (c: number) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

  const r = Math.round(Math.min(1, Math.max(0, toSrgb(rLin))) * 255);
  const g = Math.round(Math.min(1, Math.max(0, toSrgb(gLin))) * 255);
  const bVal = Math.round(Math.min(1, Math.max(0, toSrgb(bLin))) * 255);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bVal.toString(16).padStart(2, "0")}`;
}

/** Recursively convert all oklch color strings in an object to hex. */
function convertColors<T>(obj: T): T {
  if (typeof obj === "string") {
    return oklchToHex(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(convertColors) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertColors(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Convert a ThemeTokens object so all oklch() color values become hex strings
 * compatible with React Native's style system.
 */
export function toNativeTheme(tokens: ThemeTokens): ThemeTokens {
  return {
    ...tokens,
    colors: convertColors(tokens.colors),
    // shadows may contain rgba — convertColors handles passthrough
    shadows: convertColors(tokens.shadows),
  };
}

/**
 * Pre-computed native-compatible themes with hex colors.
 * Use these in React Native instead of `lightTheme`/`darkTheme` directly.
 */
export const nativeLightTheme: ThemeTokens = toNativeTheme(lightTheme);
export const nativeDarkTheme: ThemeTokens = toNativeTheme(darkTheme);

// ─── Tailwind Adapter ────────────────────────────────────────────────────────

/**
 * Converts a ThemeTokens object into a format suitable for Tailwind CSS v4.
 * Maps semantic color names to CSS custom property references since the web app
 * uses CSS custom properties for theming.
 */
export function toTailwindTheme(tokens: ThemeTokens): Record<string, unknown> {
  return {
    colors: {
      background: "var(--background)",
      foreground: "var(--foreground)",
      card: "var(--card)",
      "card-foreground": "var(--card-foreground)",
      popover: "var(--popover)",
      "popover-foreground": "var(--popover-foreground)",
      primary: "var(--primary)",
      "primary-foreground": "var(--primary-foreground)",
      secondary: "var(--secondary)",
      "secondary-foreground": "var(--secondary-foreground)",
      muted: "var(--muted)",
      "muted-foreground": "var(--muted-foreground)",
      accent: "var(--accent)",
      "accent-foreground": "var(--accent-foreground)",
      destructive: "var(--destructive)",
      "destructive-foreground": "var(--destructive-foreground)",
      border: "var(--border)",
      input: "var(--input)",
      ring: "var(--ring)",
    },
    spacing: Object.fromEntries(
      Object.entries(tokens.spacing).map(([key, value]) => [key, `${value}px`]),
    ),
    fontFamily: {
      sans: tokens.typography.fontFamily.sans,
      mono: tokens.typography.fontFamily.mono,
    },
    fontSize: Object.fromEntries(
      Object.entries(tokens.typography.fontSize).map(([key, { size, lineHeight }]) => [
        key,
        [`${size}px`, { lineHeight: `${lineHeight}px` }],
      ]),
    ),
    fontWeight: tokens.typography.fontWeight,
    borderRadius: Object.fromEntries(
      Object.entries(tokens.borderRadius).map(([key, value]) => [
        key,
        value === 9999 ? "9999px" : `${value}px`,
      ]),
    ),
    boxShadow: Object.fromEntries(
      Object.entries(tokens.shadows).map(([key, s]) => [
        key,
        `${s.offsetX}px ${s.offsetY}px ${s.blurRadius}px ${s.spreadRadius}px ${s.color}`,
      ]),
    ),
  };
}
