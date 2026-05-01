import fc from "fast-check";
import {
  lightTheme,
  darkTheme,
  type ThemeTokens,
  type CalendarColor,
  type ColorScale,
  type ShadowTokenValue,
} from "../index";

/**
 * Property 1: Design token completeness
 *
 * For any theme variant (light or dark), the exported ThemeTokens object SHALL
 * contain all required keys: colors (with all 12 calendar colors), spacing,
 * typography (with fontFamily, fontSize, fontWeight), borderRadius, and shadows,
 * and every value SHALL be of the correct type.
 *
 * **Validates: Requirements 2.2, 3.1, 3.5**
 */

const ALL_CALENDAR_COLORS: CalendarColor[] = [
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
];

const SEMANTIC_COLOR_KEYS = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primaryBase",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "destructive",
  "destructiveForeground",
  "border",
  "input",
  "ring",
] as const;

const COLOR_SCALE_STEPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

const themeArb = fc.constantFrom(lightTheme, darkTheme);

describe("Property 1: Design token completeness", () => {
  it("every theme variant contains all required top-level keys", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        expect(theme).toHaveProperty("colors");
        expect(theme).toHaveProperty("spacing");
        expect(theme).toHaveProperty("typography");
        expect(theme).toHaveProperty("borderRadius");
        expect(theme).toHaveProperty("shadows");
      }),
      { numRuns: 100 }
    );
  });

  it("every theme variant contains all semantic color keys as strings", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        for (const key of SEMANTIC_COLOR_KEYS) {
          expect(theme.colors).toHaveProperty(key);
          expect(typeof theme.colors[key]).toBe("string");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("every theme variant has a primary ColorScale with all 11 steps as strings", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        const primary: ColorScale = theme.colors.primary;
        for (const step of COLOR_SCALE_STEPS) {
          expect(primary).toHaveProperty(String(step));
          expect(typeof primary[step]).toBe("string");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("every theme variant has all 12 calendar colors with bg and fg string properties", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        for (const color of ALL_CALENDAR_COLORS) {
          expect(theme.colors.calendar).toHaveProperty(color);
          const calColor = theme.colors.calendar[color];
          expect(calColor).toHaveProperty("bg");
          expect(calColor).toHaveProperty("fg");
          expect(typeof calColor.bg).toBe("string");
          expect(typeof calColor.fg).toBe("string");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("all spacing values are numbers", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        const spacingEntries = Object.entries(theme.spacing);
        expect(spacingEntries.length).toBeGreaterThan(0);
        for (const [, value] of spacingEntries) {
          expect(typeof value).toBe("number");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("typography has fontFamily with sans and mono strings", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        expect(theme.typography).toHaveProperty("fontFamily");
        expect(typeof theme.typography.fontFamily.sans).toBe("string");
        expect(typeof theme.typography.fontFamily.mono).toBe("string");
      }),
      { numRuns: 100 }
    );
  });

  it("typography fontSize entries have size and lineHeight as numbers", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        const fontSizeEntries = Object.entries(theme.typography.fontSize);
        expect(fontSizeEntries.length).toBeGreaterThan(0);
        for (const [, value] of fontSizeEntries) {
          expect(typeof value.size).toBe("number");
          expect(typeof value.lineHeight).toBe("number");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("typography fontWeight entries are strings", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        const fontWeightEntries = Object.entries(theme.typography.fontWeight);
        expect(fontWeightEntries.length).toBeGreaterThan(0);
        for (const [, value] of fontWeightEntries) {
          expect(typeof value).toBe("string");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("all borderRadius values are numbers", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        const radiusEntries = Object.entries(theme.borderRadius);
        expect(radiusEntries.length).toBeGreaterThan(0);
        for (const [, value] of radiusEntries) {
          expect(typeof value).toBe("number");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("all shadow values have the correct ShadowTokenValue shape", () => {
    fc.assert(
      fc.property(themeArb, (theme: ThemeTokens) => {
        const shadowEntries = Object.entries(theme.shadows);
        expect(shadowEntries.length).toBeGreaterThan(0);
        for (const [, shadow] of shadowEntries) {
          const s = shadow as ShadowTokenValue;
          expect(typeof s.offsetX).toBe("number");
          expect(typeof s.offsetY).toBe("number");
          expect(typeof s.blurRadius).toBe("number");
          expect(typeof s.spreadRadius).toBe("number");
          expect(typeof s.color).toBe("string");
        }
      }),
      { numRuns: 100 }
    );
  });
});
