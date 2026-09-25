export const AUTH_SIGN_IN_ROUTE = "/sign-in";
export const AUTH_SIGN_UP_ROUTE = "/sign-up";
export const SETTINGS_ROUTE = "/settings";
export const SETTINGS_ACCOUNT_ROUTE = "/settings/account";
export const SETTINGS_APPEARANCE_ROUTE = "/settings/appearance";
export const SETTINGS_TIMEZONE_ROUTE = "/settings/timezone";
export const SETTINGS_TIME_REGION_ROUTE = "/settings/time-region";
export const SETTINGS_INVITES_ROUTE = "/settings/invites";
export const SETTINGS_NOTIFICATIONS_ROUTE = "/settings/notifications";
export const SETTINGS_SECURITY_ROUTE = "/settings/security";
export const SETTINGS_APP_ROUTE = "/settings/app";

export const NATIVE_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "slide_from_right",
  animationDuration: 280,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  gestureDirection: "horizontal" as const,
} as const;

/** Root stack screens that should not pop via swipe (home screen, auth gate). */
export const NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS = {
  gestureEnabled: false,
} as const;

type Segments = readonly string[];

export function isAuthRouteSegments(segments: Segments): boolean {
  return segments[0] === "(auth)";
}
