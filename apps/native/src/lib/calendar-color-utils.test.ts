import { nativeDarkTheme, nativeLightTheme } from "@workspace/design-tokens";
import {
  isNamedCalendarColor,
  isValidCalendarColorValue,
  mixHexInOklch,
  resolveCalendarSwatchColor,
  resolveEventBlockColor,
} from "./calendar-color-utils";

function lightness(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return channels.reduce((sum, value) => sum + value, 0) / 3;
}

describe("calendar-color-utils", () => {
  describe("isNamedCalendarColor", () => {
    it("accepts a known named color", () => {
      expect(isNamedCalendarColor("blue")).toBe(true);
    });

    it("rejects an unknown name", () => {
      expect(isNamedCalendarColor("not-a-color")).toBe(false);
    });

    it("rejects hex values (not named)", () => {
      expect(isNamedCalendarColor("#ffffff")).toBe(false);
    });
  });

  describe("isValidCalendarColorValue", () => {
    it("accepts named colors", () => {
      expect(isValidCalendarColorValue("blue")).toBe(true);
    });

    it("accepts 6-digit hex", () => {
      expect(isValidCalendarColorValue("#1a2b3c")).toBe(true);
    });

    it("accepts 3-digit hex", () => {
      expect(isValidCalendarColorValue("#abc")).toBe(true);
    });

    it("trims surrounding whitespace before validating", () => {
      expect(isValidCalendarColorValue("  blue  ")).toBe(true);
      expect(isValidCalendarColorValue("  #abc  ")).toBe(true);
    });

    it("rejects invalid hex and garbage", () => {
      expect(isValidCalendarColorValue("#12")).toBe(false);
      expect(isValidCalendarColorValue("rgb(0,0,0)")).toBe(false);
      expect(isValidCalendarColorValue("")).toBe(false);
    });
  });

  describe("resolveCalendarSwatchColor", () => {
    it("falls back to blue swatch for empty/nullish values", () => {
      const fallback = nativeLightTheme.colors.calendar.blue.bg;
      expect(resolveCalendarSwatchColor(null, nativeLightTheme)).toBe(fallback);
      expect(resolveCalendarSwatchColor(undefined, nativeLightTheme)).toBe(
        fallback,
      );
      expect(resolveCalendarSwatchColor("   ", nativeLightTheme)).toBe(fallback);
    });

    it("resolves named colors to their theme bg", () => {
      expect(resolveCalendarSwatchColor("red", nativeLightTheme)).toBe(
        nativeLightTheme.colors.calendar.red.bg,
      );
    });

    it("returns raw hex values unchanged", () => {
      expect(resolveCalendarSwatchColor("#123abc", nativeLightTheme)).toBe(
        "#123abc",
      );
    });

    it("falls back to blue for unrecognised values", () => {
      expect(resolveCalendarSwatchColor("bogus", nativeLightTheme)).toBe(
        nativeLightTheme.colors.calendar.blue.bg,
      );
    });

    it("maps the web sky alias to blue", () => {
      expect(resolveCalendarSwatchColor("sky", nativeLightTheme)).toBe(
        nativeLightTheme.colors.calendar.blue.bg,
      );
    });
  });

  describe("mixHexInOklch", () => {
    it("returns the input color at full weight", () => {
      expect(mixHexInOklch("#3366ff", 1, { l: 0.5, c: 0, h: 0 })).toBe(
        "#3366ff",
      );
    });

    it("returns the base color at zero weight", () => {
      expect(mixHexInOklch("#3366ff", 0, { l: 1, c: 0, h: 0 })).toBe(
        "#ffffff",
      );
    });
  });

  describe("resolveEventBlockColor", () => {
    it("uses the named palette for named colors", () => {
      expect(resolveEventBlockColor("red", nativeLightTheme)).toEqual(
        nativeLightTheme.colors.calendar.red,
      );
    });

    it("falls back to blue for missing or unknown colors, like web", () => {
      const blue = nativeLightTheme.colors.calendar.blue;
      expect(resolveEventBlockColor(undefined, nativeLightTheme)).toEqual(blue);
      expect(resolveEventBlockColor("bogus", nativeLightTheme)).toEqual(blue);
      expect(resolveEventBlockColor("sky", nativeLightTheme)).toEqual(blue);
    });

    it("tints hex colors light in the light theme", () => {
      const { bg, fg } = resolveEventBlockColor("#1d4ed8", nativeLightTheme);
      expect(bg).not.toBe("#1d4ed8");
      expect(lightness(bg)).toBeGreaterThan(200);
      expect(lightness(fg)).toBeLessThan(lightness(bg));
    });

    it("tints hex colors dark in the dark theme", () => {
      const { bg, fg } = resolveEventBlockColor("#1d4ed8", nativeDarkTheme);
      expect(lightness(bg)).toBeLessThan(90);
      expect(lightness(fg)).toBeGreaterThan(lightness(bg));
    });
  });
});
