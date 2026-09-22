import { describe, expect, it } from "@jest/globals";

import { buildDraggedEventUpdate } from "./event-calendar-mutations";

describe("buildDraggedEventUpdate", () => {
  it("sends only timing fields so no plaintext content leaves the device", () => {
    const body = buildDraggedEventUpdate(
      {
        start: new Date("2026-06-01T09:00:00.000Z"),
        end: new Date("2026-06-01T10:00:00.000Z"),
        allDay: false,
      },
      "Europe/Amsterdam",
    );

    expect(body).toEqual({
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T10:00:00.000Z",
      allDay: false,
      timezone: "Europe/Amsterdam",
    });
  });
});
