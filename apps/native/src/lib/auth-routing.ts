export const AUTH_SIGN_IN_ROUTE = "/sign-in";
export const AUTH_SIGN_UP_ROUTE = "/sign-up";
export const CALENDAR_HOME_ROUTE = "/calendar";
export const SEARCH_ROUTE = "/search";
export const SETTINGS_ROUTE = "/settings";
export const SETTINGS_TIMEZONE_ROUTE = "/settings/timezone";

interface AuthRedirectInput {
  isAuthenticated: boolean;
  isLoading: boolean;
  segments: string[];
}

export function getAuthRedirectPath({
  isAuthenticated,
  isLoading,
  segments,
}: AuthRedirectInput): string | null {
  if (isLoading) return null;

  const currentSegment = segments[0];
  const inAuthGroup = currentSegment === "(auth)";
  const atRoot = segments.length === 0 || currentSegment === "index";
  const atNotFound = currentSegment === "+not-found";

  if (!isAuthenticated && !inAuthGroup) {
    return AUTH_SIGN_IN_ROUTE;
  }

  if (isAuthenticated && (inAuthGroup || atRoot || atNotFound)) {
    return CALENDAR_HOME_ROUTE;
  }

  return null;
}
