import { CALENDAR_COLORS, isHexColor, isValidCalendarColor } from "../color-utils";

describe("CALENDAR_COLORS", () => {
  it("lists the twelve named calendar colors", () => {
    expect([...CALENDAR_COLORS]).toEqual([
      "blue", "orange", "violet", "rose", "emerald", "red",
      "cyan", "lime", "amber", "indigo", "pink", "teal",
    ]);
  });
});

describe("isHexColor", () => {
  it.each(["#FF0000", "#ff0000", "#ABCDEF", "#FFF", "#aB3"])("accepts %s", (input) => {
    expect(isHexColor(input)).toBe(true);
  });

  it.each(["FF0000", "#GGGGGG", "#12345", "#1234567", "#12", "", "#", "blue", "rgb(255,0,0)", "#FF000G"])(
    "rejects %s",
    (input) => {
      expect(isHexColor(input)).toBe(false);
    },
  );
});

describe("isValidCalendarColor", () => {
  it.each(CALENDAR_COLORS)("accepts named color '%s'", (color) => {
    expect(isValidCalendarColor(color)).toBe(true);
  });

  it.each(["#FF0000", "#00ff00", "#FFF", "#abc"])("accepts hex color %s", (color) => {
    expect(isValidCalendarColor(color)).toBe(true);
  });

  it.each(["chartreuse", "navy", "BLUE", "Blue", "", "random", "rgb(0,0,0)", "hsl(0,100%,50%)", "#GGG", "#12345", "FF0000"])(
    "rejects '%s'",
    (color) => {
      expect(isValidCalendarColor(color)).toBe(false);
    },
  );
});
