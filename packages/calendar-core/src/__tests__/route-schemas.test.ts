import { describe, expect, it } from "@jest/globals";
import {
  calendarColorSchema,
  eventParticipantInputSchema,
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

describe("eventParticipantInputSchema", () => {
  it("accepts valid normal participant inputs", () => {
    const valid = eventParticipantInputSchema.parse({
      email: "colleague@solace.onl",
      displayName: "Colleague",
      role: "attendee",
      status: "pending",
    });
    expect(valid.email).toBe("colleague@solace.onl");
  });

  it("strictly rejects admin@solace.onl and reserved system addresses", () => {
    expect(() =>
      eventParticipantInputSchema.parse({
        email: "admin@solace.onl",
      }),
    ).toThrow(/Cannot invite system or administrative email addresses/);

    expect(() =>
      eventParticipantInputSchema.parse({
        email: "alert@solace.onl",
      }),
    ).toThrow(/Cannot invite system or administrative email addresses/);

    expect(() =>
      eventParticipantInputSchema.parse({
        email: "root@solace.onl",
      }),
    ).toThrow(/Cannot invite system or administrative email addresses/);

    expect(() =>
      eventParticipantInputSchema.parse({
        email: "noreply@solace.onl",
      }),
    ).toThrow(/Cannot invite system or administrative email addresses/);
  });
});
