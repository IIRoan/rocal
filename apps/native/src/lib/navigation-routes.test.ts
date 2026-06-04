import {
  CALENDAR_TAB_ROUTE,
  MAIL_TAB_ROUTE,
  NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS,
  NATIVE_STACK_SCREEN_OPTIONS,
  isCalendarRouteSegments,
  isMailRouteSegments,
  isSidebarGestureRootSegments,
} from "./navigation-routes";

describe("navigation-routes", () => {
  it("keeps the internal tab routes stable", () => {
    expect(CALENDAR_TAB_ROUTE).toBe("/(tabs)/calendar");
    expect(MAIL_TAB_ROUTE).toBe("/(tabs)/mail");
  });

  it("marks calendar and mail segments correctly", () => {
    expect(isCalendarRouteSegments(["(tabs)", "calendar"])).toBe(true);
    expect(isCalendarRouteSegments(["(tabs)", "calendar", "day"])).toBe(true);
    expect(isMailRouteSegments(["(tabs)", "mail"])).toBe(true);
    expect(isMailRouteSegments(["settings"])).toBe(false);
  });

  it("only enables the sidebar edge gesture on main tab roots", () => {
    expect(isSidebarGestureRootSegments(["(tabs)", "calendar"])).toBe(true);
    expect(isSidebarGestureRootSegments(["(tabs)", "mail"])).toBe(true);
    expect(isSidebarGestureRootSegments(["(tabs)", "mail", "compose"])).toBe(
      false,
    );
    expect(isSidebarGestureRootSegments(["settings"])).toBe(false);
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
