import { describe, expect, it } from "@jest/globals";
import {
  calendarColorSchema,
  optionalCalendarColorSchema,
  timezoneSchema,
} from "../route-schemas";

describe("calendarColorSchema", () => {
  it("accepts named palette colors", () => {
    expect(calendarColorSchema.parse("blue")).toBe("blue");
    expect(calendarColorSchema.parse("teal")).toBe("teal");
  });

  it("accepts hex colors", () => {
    expect(calendarColorSchema.parse("#A1B2C3")).toBe("#A1B2C3");
    expect(calendarColorSchema.parse("#FFF")).toBe("#FFF");
  });

  it("rejects invalid colors", () => {
    expect(() => calendarColorSchema.parse("chartreuse")).toThrow(
      /Color must be one of:/,
    );
  });

  it("allows optional omission", () => {
    expect(optionalCalendarColorSchema.parse(undefined)).toBeUndefined();
  });
});

describe("timezoneSchema", () => {
  it("accepts valid IANA timezone identifiers", () => {
    expect(timezoneSchema.parse("Europe/Amsterdam")).toBe("Europe/Amsterdam");
    expect(timezoneSchema.parse("America/Los_Angeles")).toBe(
      "America/Los_Angeles",
    );
    expect(timezoneSchema.parse("UTC")).toBe("UTC");
  });

  it("rejects unknown timezone identifiers", () => {
    expect(() => timezoneSchema.parse("Mars/Olympus")).toThrow(
      /Invalid timezone identifier/,
    );
    expect(() => timezoneSchema.parse("")).toThrow(/Invalid timezone identifier/);
  });
});
