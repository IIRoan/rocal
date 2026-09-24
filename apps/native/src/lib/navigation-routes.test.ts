import {
  CALENDAR_TAB_ROUTE,
  MAIL_TAB_ROUTE,
  eventDetailRoute,
  mailMessageRoute,
  NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS,
  NATIVE_STACK_SCREEN_OPTIONS,
  isMailRouteSegments,
} from "./navigation-routes";

describe("navigation-routes", () => {
  it("keeps the internal tab routes stable", () => {
    expect(CALENDAR_TAB_ROUTE).toBe("/(tabs)/calendar");
    expect(MAIL_TAB_ROUTE).toBe("/(tabs)/mail");
    expect(eventDetailRoute("evt-1")).toBe("/event/evt-1");
    expect(mailMessageRoute("em-1")).toBe("/(tabs)/mail/message/em-1");
  });

  it("marks mail segments correctly", () => {
    expect(isMailRouteSegments(["(tabs)", "mail"])).toBe(true);
    expect(isMailRouteSegments(["settings"])).toBe(false);
  });

  it("shares consistent native stack animation defaults", () => {
    expect(NATIVE_STACK_SCREEN_OPTIONS).toMatchObject({
      headerShown: false,
      animation: "slide_from_right",
      animationDuration: 280,
      gestureEnabled: true,
    });
  });

  it("disables swipe-back on root tab and auth shells", () => {
    expect(NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS).toEqual({
      gestureEnabled: false,
    });
  });
});
