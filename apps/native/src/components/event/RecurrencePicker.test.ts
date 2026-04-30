import {
  parseRRule,
  buildRRule,
  FREQUENCY_OPTIONS,
  WEEKDAYS,
  type ParsedRule,
} from "./recurrence-picker-utils";

// ─── parseRRule ──────────────────────────────────────────────────────────────

describe("RecurrencePicker", () => {
  describe("parseRRule", () => {
    it("returns null for null input", () => {
      expect(parseRRule(null)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseRRule("")).toBeNull();
    });

    it("returns null for invalid FREQ value", () => {
      expect(parseRRule("FREQ=HOURLY;INTERVAL=1")).toBeNull();
    });

    it("parses a simple daily rule", () => {
      const result = parseRRule("FREQ=DAILY");
      expect(result).toEqual({
        frequency: "daily",
        interval: 1,
        byDay: [],
        endCondition: "never",
        count: 10,
        until: "",
      });
    });

    it("parses a weekly rule with BYDAY", () => {
      const result = parseRRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR");
      expect(result).toEqual({
        frequency: "weekly",
        interval: 2,
        byDay: [1, 3, 5],
        endCondition: "never",
        count: 10,
        until: "",
      });
    });

    it("parses a monthly rule with COUNT", () => {
      const result = parseRRule("FREQ=MONTHLY;INTERVAL=1;COUNT=5");
      expect(result).toEqual({
        frequency: "monthly",
        interval: 1,
        byDay: [],
        endCondition: "count",
        count: 5,
        until: "",
      });
    });

    it("parses a yearly rule with UNTIL", () => {
      const result = parseRRule("FREQ=YEARLY;UNTIL=20261231");
      expect(result).toEqual({
        frequency: "yearly",
        interval: 1,
        byDay: [],
        endCondition: "until",
        count: 10,
        until: "20261231",
      });
    });

    it("defaults interval to 1 when not specified", () => {
      const result = parseRRule("FREQ=WEEKLY;BYDAY=TU");
      expect(result?.interval).toBe(1);
    });

    it("parses all BYDAY values (SU through SA)", () => {
      const result = parseRRule("FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA");
      expect(result).not.toBeNull();
      expect(result!.byDay).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  // ─── buildRRule ──────────────────────────────────────────────────────────────

  describe("buildRRule", () => {
    it("builds a simple daily rule", () => {
      const rule: ParsedRule = {
        frequency: "daily",
        interval: 1,
        byDay: [],
        endCondition: "never",
        count: 10,
        until: "",
      };
      expect(buildRRule(rule)).toBe("FREQ=DAILY");
    });

    it("includes INTERVAL when greater than 1", () => {
      const rule: ParsedRule = {
        frequency: "weekly",
        interval: 2,
        byDay: [],
        endCondition: "never",
        count: 10,
        until: "",
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;INTERVAL=2");
    });

    it("includes BYDAY for weekly frequency", () => {
      const rule: ParsedRule = {
        frequency: "weekly",
        interval: 1,
        byDay: [1, 3, 5],
        endCondition: "never",
        count: 10,
        until: "",
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    });

    it("does not include BYDAY for non-weekly frequency", () => {
      const rule: ParsedRule = {
        frequency: "daily",
        interval: 1,
        byDay: [1, 3],
        endCondition: "never",
        count: 10,
        until: "",
      };
      expect(buildRRule(rule)).toBe("FREQ=DAILY");
    });

    it("includes COUNT when end condition is count", () => {
      const rule: ParsedRule = {
        frequency: "monthly",
        interval: 1,
        byDay: [],
        endCondition: "count",
        count: 5,
        until: "",
      };
      expect(buildRRule(rule)).toBe("FREQ=MONTHLY;COUNT=5");
    });

    it("includes UNTIL when end condition is until", () => {
      const rule: ParsedRule = {
        frequency: "yearly",
        interval: 1,
        byDay: [],
        endCondition: "until",
        count: 10,
        until: "20261231",
      };
      expect(buildRRule(rule)).toBe("FREQ=YEARLY;UNTIL=20261231");
    });

    it("sorts BYDAY values", () => {
      const rule: ParsedRule = {
        frequency: "weekly",
        interval: 1,
        byDay: [5, 1, 3],
        endCondition: "never",
        count: 10,
        until: "",
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    });

    it("does not include BYDAY for weekly with empty byDay", () => {
      const rule: ParsedRule = {
        frequency: "weekly",
        interval: 1,
        byDay: [],
        endCondition: "never",
        count: 10,
        until: "",
      };
      expect(buildRRule(rule)).toBe("FREQ=WEEKLY");
    });
  });

  // ─── parseRRule / buildRRule round-trip ─────────────────────────────────────

  describe("parseRRule / buildRRule round-trip", () => {
    it("round-trips a weekly rule with BYDAY", () => {
      const original = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR";
      const parsed = parseRRule(original);
      expect(parsed).not.toBeNull();
      expect(buildRRule(parsed!)).toBe(original);
    });

    it("round-trips a daily rule with COUNT", () => {
      const original = "FREQ=DAILY;COUNT=30";
      const parsed = parseRRule(original);
      expect(parsed).not.toBeNull();
      expect(buildRRule(parsed!)).toBe(original);
    });

    it("round-trips a yearly rule with UNTIL", () => {
      const original = "FREQ=YEARLY;UNTIL=20301231";
      const parsed = parseRRule(original);
      expect(parsed).not.toBeNull();
      expect(buildRRule(parsed!)).toBe(original);
    });
  });

  // ─── Constants ─────────────────────────────────────────────────────────────

  describe("FREQUENCY_OPTIONS", () => {
    it("contains 5 options including none", () => {
      expect(FREQUENCY_OPTIONS).toHaveLength(5);
    });

    it("has none as the first option", () => {
      expect(FREQUENCY_OPTIONS[0].value).toBe("none");
    });

    it("includes all four recurrence frequencies", () => {
      const values = FREQUENCY_OPTIONS.map((o) => o.value);
      expect(values).toContain("daily");
      expect(values).toContain("weekly");
      expect(values).toContain("monthly");
      expect(values).toContain("yearly");
    });
  });

  describe("WEEKDAYS", () => {
    it("contains 7 days", () => {
      expect(WEEKDAYS).toHaveLength(7);
    });

    it("starts with Sunday (0) and ends with Saturday (6)", () => {
      expect(WEEKDAYS[0].value).toBe(0);
      expect(WEEKDAYS[6].value).toBe(6);
    });

    it("has unique short labels", () => {
      const shorts = WEEKDAYS.map((d) => d.short);
      expect(new Set(shorts).size).toBe(7);
    });
  });
});
