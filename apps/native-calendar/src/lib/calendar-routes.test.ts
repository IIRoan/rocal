import {
  CALENDAR_HOME_ROUTE,
  CALENDAR_PUSH_TAP_HANDLER,
} from "./calendar-routes";

describe("calendar push tap handler", () => {
  it("maps event taps to the event or calendar route", () => {
    expect(CALENDAR_PUSH_TAP_HANDLER.route({ t: "event", eid: "evt-1" })).toBe(
      "/event/evt-1",
    );
    expect(CALENDAR_PUSH_TAP_HANDLER.route({ t: "event" })).toBe(
      CALENDAR_HOME_ROUTE,
    );
  });

  it("ignores mail and unknown taps", () => {
    expect(CALENDAR_PUSH_TAP_HANDLER.route({ t: "mail", mid: "em-1" })).toBeNull();
    expect(CALENDAR_PUSH_TAP_HANDLER.route({})).toBeNull();
  });

  it("invalidates event queries narrowly", () => {
    const invalidateQueries = jest.fn();
    CALENDAR_PUSH_TAP_HANDLER.invalidate({ invalidateQueries } as never, {
      t: "event",
      eid: "evt-1",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["event", "evt-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["events"] });

    invalidateQueries.mockClear();
    CALENDAR_PUSH_TAP_HANDLER.invalidate({ invalidateQueries } as never, {
      t: "mail",
      mid: "em-1",
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
