import {
  AUTH_SIGN_IN_ROUTE,
  CALENDAR_HOME_ROUTE,
  isAuthRouteSegments,
} from "./navigation-routes";

export {
  AUTH_SIGN_IN_ROUTE,
  AUTH_SIGN_UP_ROUTE,
  CALENDAR_HOME_ROUTE,
  SETTINGS_ROUTE,
  SETTINGS_TIMEZONE_ROUTE,
  SETTINGS_CONTACTS_ROUTE,
  SETTINGS_INVITES_ROUTE,
  SETTINGS_MAILBOXES_ROUTE,
  SETTINGS_NOTIFICATIONS_ROUTE,
} from "./navigation-routes";

interface AuthRedirectInput {
  isAuthenticated: boolean;
  isLoading: boolean;
  segments: string[];
}

function getRouteState(segments: string[]) {
  const currentSegment = segments[0];
  const inAuthGroup = isAuthRouteSegments(segments);
  const atRoot = segments.length === 0 || currentSegment === "index";
  const atNotFound = currentSegment === "+not-found";

  return {
    currentSegment,
    inAuthGroup,
    atRoot,
    atNotFound,
  };
}

export function getAuthRedirectPath({
  isAuthenticated,
  isLoading,
  segments,
}: AuthRedirectInput): string | null {
  if (isLoading) return null;

  const { inAuthGroup, atRoot, atNotFound } = getRouteState(segments);

  if (!isAuthenticated && !inAuthGroup) {
    return AUTH_SIGN_IN_ROUTE;
  }

  if (isAuthenticated && (inAuthGroup || atRoot || atNotFound)) {
    return CALENDAR_HOME_ROUTE;
  }

  return null;
}

export function shouldRenderAuthenticatedChrome({
  isAuthenticated,
  isLoading,
  segments,
}: AuthRedirectInput): boolean {
  if (isLoading || !isAuthenticated) {
    return false;
  }

  const { inAuthGroup, atRoot, atNotFound } = getRouteState(segments);
  return !inAuthGroup && !atRoot && !atNotFound;
}
