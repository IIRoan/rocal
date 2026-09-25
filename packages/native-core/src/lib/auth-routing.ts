import { AUTH_SIGN_IN_ROUTE, isAuthRouteSegments } from "./navigation-routes";

export {
  AUTH_SIGN_IN_ROUTE,
  AUTH_SIGN_UP_ROUTE,
  SETTINGS_ROUTE,
  SETTINGS_ACCOUNT_ROUTE,
  SETTINGS_APPEARANCE_ROUTE,
  SETTINGS_TIMEZONE_ROUTE,
  SETTINGS_TIME_REGION_ROUTE,
  SETTINGS_INVITES_ROUTE,
  SETTINGS_NOTIFICATIONS_ROUTE,
  SETTINGS_SECURITY_ROUTE,
  SETTINGS_APP_ROUTE,
} from "./navigation-routes";

interface AuthRouteInput {
  isAuthenticated: boolean;
  isLoading: boolean;
  segments: string[];
}

interface AuthRedirectInput extends AuthRouteInput {
  /** The app's signed-in landing route (calendar or mail). */
  homeRoute: string;
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
  homeRoute,
}: AuthRedirectInput): string | null {
  if (isLoading) return null;

  const { inAuthGroup, atRoot, atNotFound } = getRouteState(segments);

  if (!isAuthenticated && !inAuthGroup) {
    return AUTH_SIGN_IN_ROUTE;
  }

  if (isAuthenticated && (inAuthGroup || atRoot || atNotFound)) {
    return homeRoute;
  }

  return null;
}

export function shouldRenderAuthenticatedChrome({
  isAuthenticated,
  isLoading,
  segments,
}: AuthRouteInput): boolean {
  if (isLoading || !isAuthenticated) {
    return false;
  }

  const { inAuthGroup, atRoot, atNotFound } = getRouteState(segments);
  return !inAuthGroup && !atRoot && !atNotFound;
}
