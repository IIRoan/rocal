import { parseRRule, parseStoredRecurrence } from "./recurrence-picker-utils";

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

  describe("parseStoredRecurrence", () => {
    it("returns null for empty values", () => {
      expect(parseStoredRecurrence(null)).toBeNull();
      expect(parseStoredRecurrence("  ")).toBeNull();
    });

    it("reads the JSON rule the backend stores", () => {
      const result = parseStoredRecurrence(
        JSON.stringify({
          frequency: "monthly",
          interval: 2,
          byMonthDay: [23],
          until: "2027-01-01T00:00:00.000Z",
        }),
      );
      expect(result).toEqual({
        frequency: "monthly",
        interval: 2,
        byMonthDay: [23],
        until: new Date("2027-01-01T00:00:00.000Z"),
      });
    });

    it("converts legacy RRULE strings into a JSON-compatible rule", () => {
      expect(parseStoredRecurrence("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4")).toEqual({
        frequency: "weekly",
        interval: 1,
        byWeekDay: [1, 3],
        count: 4,
      });
      expect(parseStoredRecurrence("FREQ=DAILY;UNTIL=20261231")).toEqual({
        frequency: "daily",
        interval: 1,
        until: new Date(2026, 11, 31),
      });
    });

    it("rejects invalid rules", () => {
      expect(parseStoredRecurrence("FREQ=HOURLY")).toBeNull();
      expect(parseStoredRecurrence('{"frequency":"hourly","interval":1}')).toBeNull();
    });
  });
});
