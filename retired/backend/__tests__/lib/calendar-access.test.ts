import { describe, expect, it, jest } from "@jest/globals";

import {
  assertCalendarWritable,
  findUserCalendarById,
  findUserCalendarOrThrow,
  isCalendarWritable,
} from "../../lib/calendar-access";
import { ValidationError } from "../../lib/errors";

describe("calendar-access", () => {
  describe("isCalendarWritable", () => {
    it("returns true only for owned, non-sync calendars", () => {
      expect(isCalendarWritable({ kind: "owned", isSyncOnly: false })).toBe(
        true,
      );
      expect(isCalendarWritable({ kind: "owned", isSyncOnly: true })).toBe(
        false,
      );
      expect(isCalendarWritable({ kind: "shared", isSyncOnly: false })).toBe(
        false,
      );
    });
  });

  describe("assertCalendarWritable", () => {
    it("throws ValidationError for read-only calendars", () => {
      expect(() =>
        assertCalendarWritable({ kind: "shared", isSyncOnly: false }),
      ).toThrow(ValidationError);
    });

    it("passes silently for writable calendars", () => {
      expect(() =>
        assertCalendarWritable({ kind: "owned", isSyncOnly: false }),
      ).not.toThrow();
    });

    it("uses provided message and field", () => {
      try {
        assertCalendarWritable(
          { kind: "owned", isSyncOnly: true },
          "custom",
          "field",
        );
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).message).toBe("custom");
        expect((err as ValidationError).field).toBe("field");
      }
    });
  });

  describe("findUserCalendarById / findUserCalendarOrThrow", () => {
    const mockCalendar = {
      id: "cal-1",
      userId: "user-1",
      kind: "owned",
      isSyncOnly: false,
    };

    function makePrisma(result: unknown) {
      return {
        calendar: {
          findFirst: jest.fn(async () => result),
        },
      } as never;
    }

    it("returns the calendar when found", async () => {
      const prisma = makePrisma(mockCalendar);
      const result = await findUserCalendarById(prisma, "user-1", "cal-1");
      expect(result).toEqual(mockCalendar);
    });

    it("returns null when not found", async () => {
      const prisma = makePrisma(null);
      const result = await findUserCalendarById(prisma, "user-1", "cal-1");
      expect(result).toBeNull();
    });

    it("throws ValidationError when missing in OrThrow variant", async () => {
      const prisma = makePrisma(null);
      await expect(
        findUserCalendarOrThrow(prisma, "user-1", "cal-1"),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
