import { CALENDAR_COLORS } from "./color-picker-utils";

// ─── CALENDAR_COLORS constant ────────────────────────────────────────────────

describe("ColorPicker", () => {
  describe("CALENDAR_COLORS", () => {
    it("contains exactly 12 colors", () => {
      expect(CALENDAR_COLORS).toHaveLength(12);
    });

    it("contains all expected calendar colors", () => {
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
      expect([...CALENDAR_COLORS]).toEqual(expected);
    });

    it("has no duplicate colors", () => {
      const unique = new Set(CALENDAR_COLORS);
      expect(unique.size).toBe(CALENDAR_COLORS.length);
    });
  });
});
