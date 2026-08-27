export const AUTH_SIGN_IN_ROUTE = "/sign-in";
export const AUTH_SIGN_UP_ROUTE = "/sign-up";
export const CALENDAR_HOME_ROUTE = "/calendar";
export const MAIL_HOME_ROUTE = "/mail";
export const SETTINGS_ROUTE = "/settings";
export const SETTINGS_ACCOUNT_ROUTE = "/settings/account";
export const SETTINGS_APPEARANCE_ROUTE = "/settings/appearance";
export const SETTINGS_CALENDAR_ROUTE = "/settings/calendar";
export const SETTINGS_MAIL_ROUTE = "/settings/mail";
export const SETTINGS_TIMEZONE_ROUTE = "/settings/timezone";
export const SETTINGS_TIME_REGION_ROUTE = "/settings/time-region";
export const SETTINGS_CONTACTS_ROUTE = "/settings/contacts";
export const SETTINGS_INVITES_ROUTE = "/settings/invites";
export const SETTINGS_MAILBOXES_ROUTE = "/settings/mailboxes";
export const SETTINGS_LABELS_ROUTE = "/settings/labels";
export const SETTINGS_NOTIFICATIONS_ROUTE = "/settings/notifications";
export const SETTINGS_SECURITY_ROUTE = "/settings/security";
export const SETTINGS_APP_ROUTE = "/settings/app";

export const CALENDAR_TAB_ROUTE = "/(tabs)/calendar";
export const MAIL_TAB_ROUTE = "/(tabs)/mail";

export function eventDetailRoute(eventId: string): string {
  return `/event/${eventId}`;
}

export function mailMessageRoute(messageId: string): string {
  return `${MAIL_TAB_ROUTE}/message/${encodeURIComponent(messageId)}`;
}

/** Native stack defaults — interactive swipe-back (iOS full-screen gesture). */
export const NATIVE_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: "slide_from_right",
  animationDuration: 280,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  gestureDirection: "horizontal" as const,
} as const;

/** Root stack screens that should not pop via swipe (main tabs, auth gate). */
export const NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS = {
  gestureEnabled: false,
} as const;

type Segments = readonly string[];

export function isAuthRouteSegments(segments: Segments): boolean {
  return segments[0] === "(auth)";
}

export function isCalendarRouteSegments(segments: Segments): boolean {
  return segments[0] === "(tabs)" && segments[1] === "calendar";
}

export function isMailRouteSegments(segments: Segments): boolean {
  return segments[0] === "(tabs)" && segments[1] === "mail";
}

export function isSidebarGestureRootSegments(segments: Segments): boolean {
  return (
    (isCalendarRouteSegments(segments) || isMailRouteSegments(segments)) &&
    segments.length === 2
  );
}
