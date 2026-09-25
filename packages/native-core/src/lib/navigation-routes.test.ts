import {
  NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS,
  NATIVE_STACK_SCREEN_OPTIONS,
  isAuthRouteSegments,
} from "./navigation-routes";

describe("navigation-routes", () => {
  it("marks auth segments correctly", () => {
    expect(isAuthRouteSegments(["(auth)", "sign-in"])).toBe(true);
    expect(isAuthRouteSegments(["settings"])).toBe(false);
  });

  it("shares consistent native stack animation defaults", () => {
    expect(NATIVE_STACK_SCREEN_OPTIONS).toMatchObject({
      headerShown: false,
      animation: "slide_from_right",
      animationDuration: 280,
      gestureEnabled: true,
    });
  });

  it("disables swipe-back on root home and auth shells", () => {
    expect(NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS).toEqual({
      gestureEnabled: false,
    });
  });
});
