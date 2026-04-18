import { describe, expect, it } from "@jest/globals";

import {
  ALLOWED_CALENDAR_COLORS,
  isHexCalendarColor,
  isValidCalendarColor,
} from "../../lib/colors";

describe("ALLOWED_CALENDAR_COLORS", () => {
  it("contains exactly 12 named colors", () => {
    expect(ALLOWED_CALENDAR_COLORS).toHaveLength(12);
  });

  it("includes all expected named colors", () => {
    const expected = [
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
    expect([...ALLOWED_CALENDAR_COLORS]).toEqual(expected);
  });
});

describe("isHexCalendarColor", () => {
  it.each([
    ["#FF0000", true],
    ["#ff0000", true],
    ["#123456", true],
    ["#ABCDEF", true],
    ["#abcdef", true],
    ["#FFF", true],
    ["#fff", true],
    ["#123", true],
    ["#aB3", true],
  ])("accepts valid hex color %s", (input, expected) => {
    expect(isHexCalendarColor(input)).toBe(expected);
  });

  it.each([
    ["FF0000", false],
    ["#GGGGGG", false],
    ["#12345", false],
    ["#1234567", false],
    ["#12", false],
    ["#1", false],
    ["", false],
    ["#", false],
    ["blue", false],
    ["rgb(255,0,0)", false],
    ["#FF000G", false],
  ])("rejects invalid hex color %s", (input, expected) => {
    expect(isHexCalendarColor(input)).toBe(expected);
  });
});

describe("isValidCalendarColor", () => {
  it.each(ALLOWED_CALENDAR_COLORS)(
    "accepts named color '%s'",
    (color) => {
      expect(isValidCalendarColor(color)).toBe(true);
    },
  );

  it("accepts valid 6-digit hex colors", () => {
    expect(isValidCalendarColor("#FF0000")).toBe(true);
    expect(isValidCalendarColor("#00ff00")).toBe(true);
    expect(isValidCalendarColor("#123abc")).toBe(true);
  });

  it("accepts valid 3-digit hex colors", () => {
    expect(isValidCalendarColor("#FFF")).toBe(true);
    expect(isValidCalendarColor("#abc")).toBe(true);
  });

  it.each([
    "chartreuse",
    "navy",
    "gold",
    "turquoise",
    "BLUE",
    "Blue",
    "",
    "random",
    "rgb(0,0,0)",
    "hsl(0,100%,50%)",
    "#GGG",
    "#12345",
    "FF0000",
  ])("rejects invalid color '%s'", (color) => {
    expect(isValidCalendarColor(color)).toBe(false);
  });
});
