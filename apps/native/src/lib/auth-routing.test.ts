import {
  AUTH_SIGN_IN_ROUTE,
  CALENDAR_HOME_ROUTE,
  getAuthRedirectPath,
  shouldRenderAuthenticatedChrome,
} from "./auth-routing";

describe("getAuthRedirectPath", () => {
  it("sends signed-in users on auth screens to the calendar", () => {
    expect(
      getAuthRedirectPath({
        isAuthenticated: true,
        isLoading: false,
        segments: ["(auth)", "sign-in"],
      }),
    ).toBe(CALENDAR_HOME_ROUTE);
  });

  it("sends signed-in users from the app root to the calendar", () => {
    expect(
      getAuthRedirectPath({
        isAuthenticated: true,
        isLoading: false,
        segments: [],
      }),
    ).toBe(CALENDAR_HOME_ROUTE);
  });

  it("sends signed-out users on protected routes to sign-in", () => {
    expect(
      getAuthRedirectPath({
        isAuthenticated: false,
        isLoading: false,
        segments: ["(tabs)", "calendar"],
      }),
    ).toBe(AUTH_SIGN_IN_ROUTE);
  });

  it("keeps signed-out users on auth routes", () => {
    expect(
      getAuthRedirectPath({
        isAuthenticated: false,
        isLoading: false,
        segments: ["(auth)", "sign-up"],
      }),
    ).toBeNull();
  });

  it("keeps signed-in users on valid in-app routes", () => {
    expect(
      getAuthRedirectPath({
        isAuthenticated: true,
        isLoading: false,
        segments: ["settings"],
      }),
    ).toBeNull();
  });
});

describe("shouldRenderAuthenticatedChrome", () => {
  it("hides chrome while auth state is loading", () => {
    expect(
      shouldRenderAuthenticatedChrome({
        isAuthenticated: true,
        isLoading: true,
        segments: ["(tabs)", "calendar"],
      }),
    ).toBe(false);
  });

  it("hides chrome on auth routes", () => {
    expect(
      shouldRenderAuthenticatedChrome({
        isAuthenticated: true,
        isLoading: false,
        segments: ["(auth)", "sign-in"],
      }),
    ).toBe(false);
  });

  it("shows chrome for authenticated app routes", () => {
    expect(
      shouldRenderAuthenticatedChrome({
        isAuthenticated: true,
        isLoading: false,
        segments: ["settings", "timezone"],
      }),
    ).toBe(true);
  });
});
