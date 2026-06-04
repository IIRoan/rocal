import { nativeLightTheme } from "@workspace/design-tokens";
import {
  isNamedCalendarColor,
  isValidCalendarColorValue,
  resolveCalendarSwatchColor,
} from "./calendar-color-utils";

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
  });
});
