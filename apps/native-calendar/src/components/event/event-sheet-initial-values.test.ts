import { describe, expect, it } from "@jest/globals";
import { eventSheetInitialValues } from "./event-sheet-initial-values";

const TIMEZONE = "Europe/Amsterdam";

describe("eventSheetInitialValues", () => {
  it("seeds a swept range in the account time zone before date and hour", () => {
    expect(
      eventSheetInitialValues(
        {
          type: "create",
          date: "2026-11-20",
          hour: "8",
          start: "2026-11-14T13:00:00.000Z",
          end: "2026-11-14T14:45:00.000Z",
        },
        undefined,
        TIMEZONE,
      ),
    ).toEqual({
      start: "2026-11-14T14:00",
      end: "2026-11-14T15:45",
      timezone: TIMEZONE,
    });
  });

  it("keeps the one-hour slot on the tapped day and hour", () => {
    expect(
      eventSheetInitialValues(
        { type: "create", date: "2026-11-20", hour: "8" },
        undefined,
        TIMEZONE,
      ),
    ).toEqual({
      start: "2026-11-20T08:00",
      end: "2026-11-20T09:00",
      timezone: TIMEZONE,
    });
  });

  it("leaves a plain create unseeded", () => {
    expect(eventSheetInitialValues({ type: "create" }, undefined, TIMEZONE)).toBeUndefined();
  });
});
