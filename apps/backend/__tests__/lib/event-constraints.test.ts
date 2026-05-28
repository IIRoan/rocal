import { describe, expect, it } from "@jest/globals";

import {
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_LOCATION_MAX_LENGTH,
  EVENT_MAX_REMINDER_MINUTES,
  EVENT_TITLE_MAX_LENGTH,
  validateEventDescriptionLength,
  validateEventLocationLength,
  validateEventReminderMinutes,
  validateEventTitleLength,
} from "../../lib/event-constraints";
import { ValidationError } from "../../lib/errors";

describe("event-constraints", () => {
  describe("validateEventTitleLength", () => {
    it("accepts null/undefined/empty title", () => {
      expect(() => validateEventTitleLength(null)).not.toThrow();
      expect(() => validateEventTitleLength(undefined)).not.toThrow();
      expect(() => validateEventTitleLength("")).not.toThrow();
    });

    it("accepts title at the maximum length", () => {
      const title = "a".repeat(EVENT_TITLE_MAX_LENGTH);
      expect(() => validateEventTitleLength(title)).not.toThrow();
    });

    it("rejects title exceeding the maximum length", () => {
      const title = "a".repeat(EVENT_TITLE_MAX_LENGTH + 1).padEnd(0, " ");
      try {
        validateEventTitleLength(title);
        throw new Error("expected ValidationError");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("title");
      }
    });

    it("trims whitespace before measuring length", () => {
      const title = `   ${"a".repeat(EVENT_TITLE_MAX_LENGTH)}   `;
      expect(() => validateEventTitleLength(title)).not.toThrow();
    });
  });

  describe("validateEventDescriptionLength", () => {
    it("accepts null/undefined/empty", () => {
      expect(() => validateEventDescriptionLength(null)).not.toThrow();
      expect(() => validateEventDescriptionLength(undefined)).not.toThrow();
      expect(() => validateEventDescriptionLength("")).not.toThrow();
    });

    it("rejects description over the max", () => {
      const desc = "a".repeat(EVENT_DESCRIPTION_MAX_LENGTH + 1);
      expect(() => validateEventDescriptionLength(desc)).toThrow(
        ValidationError,
      );
    });
  });

  describe("validateEventLocationLength", () => {
    it("rejects location over the max", () => {
      const loc = "a".repeat(EVENT_LOCATION_MAX_LENGTH + 1);
      expect(() => validateEventLocationLength(loc)).toThrow(ValidationError);
    });

    it("accepts a location at the max", () => {
      const loc = "a".repeat(EVENT_LOCATION_MAX_LENGTH);
      expect(() => validateEventLocationLength(loc)).not.toThrow();
    });
  });

  describe("validateEventReminderMinutes", () => {
    it("returns the value unchanged for null/undefined", () => {
      expect(validateEventReminderMinutes(null)).toBeNull();
      expect(validateEventReminderMinutes(undefined)).toBeUndefined();
    });

    it("returns a coerced numeric value", () => {
      expect(validateEventReminderMinutes(15)).toBe(15);
    });

    it("rejects negative values", () => {
      expect(() => validateEventReminderMinutes(-1)).toThrow(ValidationError);
    });

    it("rejects values above the maximum", () => {
      expect(() =>
        validateEventReminderMinutes(EVENT_MAX_REMINDER_MINUTES + 1),
      ).toThrow(ValidationError);
    });

    it("rejects NaN", () => {
      expect(() =>
        validateEventReminderMinutes(Number("not-a-number") as unknown as number),
      ).toThrow(ValidationError);
    });
  });
});
