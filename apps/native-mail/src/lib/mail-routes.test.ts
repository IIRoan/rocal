import {
  MAIL_HOME_ROUTE,
  MAIL_PUSH_TAP_HANDLER,
  calendarEventDeepLink,
  mailMessageRoute,
} from "./mail-routes";

describe("mail routes", () => {
  it("encodes message ids in the message route", () => {
    expect(mailMessageRoute("em/1")).toBe("/mail/message/em%2F1");
  });

  it("deep links events into the matching calendar app build", () => {
    expect(calendarEventDeepLink("evt-1", "production")).toBe(
      "solace://event/evt-1",
    );
    expect(calendarEventDeepLink("evt-1", "preview")).toBe(
      "solace://event/evt-1",
    );
    expect(calendarEventDeepLink("evt 1", "development")).toBe(
      "solace-dev://event/evt%201",
    );
  });
});

describe("mail push tap handler", () => {
  it("maps mail taps to the message or inbox route", () => {
    expect(MAIL_PUSH_TAP_HANDLER.route({ t: "mail", mid: "em-1" })).toBe(
      mailMessageRoute("em-1"),
    );
    expect(MAIL_PUSH_TAP_HANDLER.route({ t: "mail" })).toBe(MAIL_HOME_ROUTE);
  });

  it("ignores event and unknown taps", () => {
    expect(MAIL_PUSH_TAP_HANDLER.route({ t: "event", eid: "evt-1" })).toBeNull();
    expect(MAIL_PUSH_TAP_HANDLER.route({})).toBeNull();
  });

  it("invalidates mail queries narrowly", () => {
    const invalidateQueries = jest.fn();
    MAIL_PUSH_TAP_HANDLER.invalidate({ invalidateQueries } as never, {
      t: "mail",
      mid: "em-1",
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["mail", "message", "em-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["mail", "messages"],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["mail"] });

    invalidateQueries.mockClear();
    MAIL_PUSH_TAP_HANDLER.invalidate({ invalidateQueries } as never, {
      t: "event",
      eid: "evt-1",
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
