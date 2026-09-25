import {
  AUTH_SIGN_IN_ROUTE,
  getAuthRedirectPath,
  shouldRenderAuthenticatedChrome,
} from "./auth-routing";

const HOME_ROUTE = "/home";

describe("getAuthRedirectPath", () => {
  it("sends signed-in users on auth screens to the app home", () => {
    expect(
      getAuthRedirectPath({
        homeRoute: HOME_ROUTE,
        isAuthenticated: true,
        isLoading: false,
        segments: ["(auth)", "sign-in"],
      }),
    ).toBe(HOME_ROUTE);
  });

  it("sends signed-in users from the app root to the app home", () => {
    expect(
      getAuthRedirectPath({
        homeRoute: HOME_ROUTE,
        isAuthenticated: true,
        isLoading: false,
        segments: [],
      }),
    ).toBe(HOME_ROUTE);
  });

  it("sends signed-out users on protected routes to sign-in", () => {
    expect(
      getAuthRedirectPath({
        homeRoute: HOME_ROUTE,
        isAuthenticated: false,
        isLoading: false,
        segments: ["calendar"],
      }),
    ).toBe(AUTH_SIGN_IN_ROUTE);
  });

  it("keeps signed-out users on auth routes", () => {
    expect(
      getAuthRedirectPath({
        homeRoute: HOME_ROUTE,
        isAuthenticated: false,
        isLoading: false,
        segments: ["(auth)", "sign-up"],
      }),
    ).toBeNull();
  });

  it("keeps signed-in users on valid in-app routes", () => {
    expect(
      getAuthRedirectPath({
        homeRoute: HOME_ROUTE,
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
        segments: ["calendar"],
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
