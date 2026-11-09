/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppState } from "react-native";

import { calendarApiService } from "../lib/api";
import { authClient, clearAuthSessionCache, readAuthSessionCache } from "../lib/auth-client";
import { getAuthCapabilities } from "../lib/auth-capabilities";
import { getSessionCookie, readSessionTokenFromJar, waitForSessionCookie } from "../lib/session-cookie";
import { signInWithBrowserPasskey } from "../lib/passkey-browser-bridge";
import { unregisterNativePushDevice } from "../lib/push-notifications";
import {
  getFallbackSessionToken,
  setFallbackSessionToken,
} from "../lib/session-token-fallback";
import { AuthProvider, useAuth } from "./AuthProvider";
import { queryClient } from "./QueryProvider";

jest.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: {
    OS: "ios",
  },
}));

const mockClearNativeTitleIndex = jest.fn(async () => undefined);
const mockClearRecoverableStoredDevice = jest.fn(async () => undefined);
const mockRecoverableStoredDeviceId = jest.fn(async (): Promise<string | null> => null);
jest.mock("../lib/native-e2ee-provider", () => ({
  clearRecoverableStoredDevice: () => mockClearRecoverableStoredDevice(),
  recoverableStoredDeviceId: () => mockRecoverableStoredDeviceId(),
}));
jest.mock("../lib/search/title-index-store", () => ({
  clearNativeTitleIndex: () => mockClearNativeTitleIndex(),
}));
jest.mock("expo-linking", () => ({
  createURL: jest.fn(() => "solace://"),
}));

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock("../lib/auth-client", () => ({
  clearAuthSessionCache: jest.fn(async () => undefined),
  readAuthSessionCache: jest.fn(async (): Promise<unknown> => null),
  authClient: {
    $store: { atoms: { session: { get: jest.fn(() => ({ data: null })) } } },
    getSession: jest.fn(),
    signIn: {
      email: jest.fn(),
      social: jest.fn(),
      passkey: jest.fn(),
    },
    signUp: {
      email: jest.fn(),
    },
    signOut: jest.fn(),
    passkey: {
      addPasskey: jest.fn(),
    },
  },
}));

jest.mock("../lib/auth-capabilities", () => ({
  getAuthCapabilities: jest.fn(),
}));

jest.mock("../lib/passkey-auth", () => ({
  deleteStoredPasskey: jest.fn(),
  getDefaultPasskeyName: jest.fn(() => "My device"),
}));

jest.mock("../lib/passkey-browser-bridge", () => ({
  isPasskeyBridgeOriginSecure: jest.fn(() => true),
  registerBrowserPasskey: jest.fn(),
  resolvePasskeyBridgeBaseUrl: jest.fn(() => "https://bridge.solace.test"),
  signInWithBrowserPasskey: jest.fn(),
}));

jest.mock("../lib/session-cookie", () => ({
  getSessionCookie: jest.fn(() => "__Secure-better-auth.session_token=session-token.signature"),
  waitForSessionCookie: jest.fn(),
  ensureSessionTokenCookie: jest.fn(async () => true),
  healAuthCookieJar: jest.fn(async () => undefined),
  rememberSessionTokenFromJar: jest.fn(async () => "session-token"),
  readSessionTokenFromJar: jest.fn(async () => "existing-signed-cookie"),
  persistRenewedSessionCookie: jest.fn(async () => undefined),
}));

jest.mock("../lib/push-notifications", () => ({
  unregisterNativePushDevice: jest.fn(async () => {}),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type AuthContextValue = ReturnType<typeof useAuth>;

const mockGetSession = jest.mocked(authClient.getSession);
const mockGetSessionState = jest.mocked(authClient.$store.atoms.session.get);
const mockClearAuthSessionCache = jest.mocked(clearAuthSessionCache);
const mockReadAuthSessionCache = jest.mocked(readAuthSessionCache);
const mockEmailSignIn = jest.mocked(authClient.signIn.email);
const mockSocialSignIn = jest.mocked(authClient.signIn.social);
const mockPasskeySignIn = jest.mocked(authClient.signIn.passkey);
const mockEmailSignUp = jest.mocked(authClient.signUp.email);
const mockSignOut = jest.mocked(authClient.signOut);
const mockGetAuthCapabilities = jest.mocked(getAuthCapabilities);
const mockWaitForSessionCookie = jest.mocked(waitForSessionCookie);
const mockReadSessionTokenFromJar = jest.mocked(readSessionTokenFromJar);
const mockSignInWithBrowserPasskey = jest.mocked(signInWithBrowserPasskey);
const mockUnregisterNativePushDevice = jest.mocked(unregisterNativePushDevice);
const mockOnSignedOut = jest.fn(async () => {});
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

function createSessionData() {
  return {
    user: {
      id: "user-1",
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2025-01-01T00:00:00.000Z"),
      name: "Roan",
      email: "roan@example.com",
      emailVerified: true,
      image: null,
    },
    session: {
      id: "session-1",
      token: "session-token",
      userId: "user-1",
      expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2025-01-01T00:00:00.000Z"),
    },
  };
}

function createAuthResult() {
  return {
    data: createSessionData(),
    error: null,
  };
}

/** Better Auth email sign-in body — token + user, no session object. */
function createEmailSignInResult() {
  return {
    data: {
      redirect: false,
      token: "session-token",
      user: createSessionData().user,
    },
    error: null,
  };
}

function flushPromises() {
  return act(async () => {
    await Promise.resolve();
  });
}

describe("AuthProvider", () => {
  let capturedAuth: AuthContextValue | null = null;
  let container: HTMLDivElement;
  let root: Root;

  function AuthProbe() {
    capturedAuth = useAuth();
    return <div data-testid="auth-method">{capturedAuth.lastAuthMethod}</div>;
  }

  async function renderProvider(expectLoaded = true) {
    await act(async () => {
      root.render(
        <AuthProvider
          lifecycle={{
            onSignedOut: mockOnSignedOut,
          }}
        >
          <AuthProbe />
        </AuthProvider>,
      );
      await Promise.resolve();
    });

    if (expectLoaded) expect(capturedAuth?.isLoading).toBe(false);
  }

  function getAuth() {
    if (!capturedAuth) {
      throw new Error("Auth context was not captured.");
    }

    return capturedAuth;
  }

  beforeEach(() => {
    setFallbackSessionToken(null);
    AppState.currentState = "active";
    globalThis.fetch = mockFetch as typeof fetch;
    capturedAuth = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockGetSession.mockReset();
    mockGetSessionState.mockReturnValue({ data: null });
    mockClearAuthSessionCache.mockClear();
    mockReadAuthSessionCache.mockReset().mockResolvedValue(null);
    jest.mocked(getSessionCookie).mockReturnValue("__Secure-better-auth.session_token=session-token.signature");
    mockEmailSignIn.mockReset();
    mockSocialSignIn.mockReset();
    mockPasskeySignIn.mockReset();
    mockEmailSignUp.mockReset();
    mockSignOut.mockReset();
    mockGetAuthCapabilities.mockReset();
    mockWaitForSessionCookie.mockReset();
    mockReadSessionTokenFromJar.mockReset().mockResolvedValue("existing-signed-cookie");
    mockSignInWithBrowserPasskey.mockReset();
    mockUnregisterNativePushDevice.mockReset();
    mockOnSignedOut.mockClear();
    mockClearRecoverableStoredDevice.mockClear();

    mockGetAuthCapabilities.mockReturnValue({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "web",
      passkeyMessage: null,
    });
    mockGetSession.mockResolvedValue({ data: null });
    mockWaitForSessionCookie.mockResolvedValue(true);
    mockSignInWithBrowserPasskey.mockResolvedValue(createSessionData());
    mockEmailSignIn.mockResolvedValue(createAuthResult());
    mockEmailSignUp.mockResolvedValue(createAuthResult());
    mockSocialSignIn.mockResolvedValue(createAuthResult());
    mockPasskeySignIn.mockResolvedValue(createAuthResult());
    mockSignOut.mockResolvedValue(undefined as never);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        hasPasskeys: false,
        requiresPasskeyStepUp: false,
      }),
    } as Response);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  it("stores the email sign-in password as the pending encryption password", async () => {
    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().lastAuthMethod).toBe("email-password");
    expect(getAuth().peekPendingAuthPassword()).toBe("secret-password");
    expect(getAuth().peekPendingAuthPassword()).toBe("secret-password");
    expect(getAuth().consumePendingAuthPassword()).toBe("secret-password");
    expect(getAuth().consumePendingAuthPassword()).toBeNull();
  });

  it("stashes the email sign-in password before the session can become available", async () => {
    await renderProvider();

    mockEmailSignIn.mockImplementation(async () => {
      expect(getAuth().peekPendingAuthPassword()).toBe("secret-password");
      return createAuthResult();
    });

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(mockEmailSignIn).toHaveBeenCalledWith({
      email: "roan@example.com",
      password: "secret-password",
    });
  });

  it("stores the email sign-up password as the pending encryption password", async () => {
    await renderProvider();

    await act(async () => {
      await getAuth().signUp(
        "Roan",
        "roan@example.com",
        "new-account-password",
      );
    });

    expect(getAuth().lastAuthMethod).toBe("email-password");
    expect(getAuth().consumePendingAuthPassword()).toBe("new-account-password");
    expect(getAuth().consumePendingAuthPassword()).toBeNull();
  });

  it.each([
    ["the server reports no session", { data: null }, 1],
    ["the session check fails", { data: null, error: { status: 503 } }, 0],
  ])("wipes app data on startup only when %s", async (_case, response, wipes) => {
    mockGetSession.mockResolvedValue(response as never);

    await renderProvider();
    await flushPromises();

    expect(getAuth().isAuthenticated).toBe(false);
    expect(mockOnSignedOut).toHaveBeenCalledTimes(wipes);
  });

  it("opens a valid cached session when the startup request never answers", async () => {
    jest.useFakeTimers();
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    mockGetSessionState.mockReturnValue({ data: cached });
    mockGetSession.mockImplementationOnce(() => new Promise(() => undefined));

    await renderProvider(false);
    expect(getAuth().isLoading).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });

    expect(getAuth().isLoading).toBe(false);
    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().user?.id).toBe(cached.user.id);
    expect(mockOnSignedOut).not.toHaveBeenCalled();
    expect(mockClearAuthSessionCache).not.toHaveBeenCalled();
    const request = mockGetSession.mock.calls[0]?.[0]?.fetchOptions;
    expect(request?.signal?.aborted).toBe(true);
    expect(() => request?.onSuccess?.({
      data: createSessionData(),
      response: {} as Response,
      request: { url: "https://api.solace.test/api/auth/get-session", headers: new Headers(), body: null, method: "GET", signal: new AbortController().signal },
    })).toThrow("Session changed while loading.");
  });

  it("restores the Secure Store session when library cache hydration has not finished", async () => {
    jest.useFakeTimers();
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    mockReadAuthSessionCache.mockResolvedValue(cached);
    mockGetSession.mockImplementationOnce(() => new Promise(() => undefined));
    await renderProvider(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().user?.id).toBe(cached.user.id);
    expect(mockClearAuthSessionCache).not.toHaveBeenCalled();
  });

  it("does not charge local cache loading against the network deadline", async () => {
    jest.useFakeTimers();
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    let finishCache: ((value: unknown) => void) | undefined;
    mockReadAuthSessionCache.mockImplementationOnce(() => new Promise((resolve) => { finishCache = resolve; }));
    mockGetSession.mockImplementationOnce(() => new Promise(() => undefined));
    await renderProvider(false);
    await act(async () => { await jest.advanceTimersByTimeAsync(4_000); });
    expect(getAuth().isLoading).toBe(true);
    expect(mockGetSession).not.toHaveBeenCalled();
    await act(async () => { finishCache?.(cached); });
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
    expect(getAuth().isAuthenticated).toBe(true);
  });

  it("cannot apply a stored session read that finishes after sign-out", async () => {
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    let finishCache: ((value: unknown) => void) | undefined;
    mockReadAuthSessionCache.mockImplementationOnce(() => new Promise((resolve) => { finishCache = resolve; }));
    await renderProvider(false);
    await act(async () => { await getAuth().signOut(); });
    await act(async () => { finishCache?.(cached); });
    expect(getAuth().isAuthenticated).toBe(false);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it.each([0, 503])("restores a cached session after a transport/server failure (%s)", async (status) => {
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    mockGetSessionState.mockReturnValue({ data: cached });
    mockGetSession.mockResolvedValueOnce({ data: null, error: { status } } as never);

    await renderProvider();
    expect(getAuth().isAuthenticated).toBe(true);
    expect(mockOnSignedOut).not.toHaveBeenCalled();
  });

  it.each([
    "solace-passkey-step-up=step-up-cookie",
    "__Secure-better-auth.session_token=another-session.signature",
  ])("refuses offline authentication with an unrelated cookie (%s)", async (cookie) => {
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    mockReadAuthSessionCache.mockResolvedValue(cached);
    jest.mocked(getSessionCookie).mockReturnValue(cookie);
    mockGetSession.mockRejectedValueOnce(new Error("Offline"));

    await renderProvider();

    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
  });

  it("restores only the cache matching the current cookie when hydration holds another account", async () => {
    const stale = createSessionData();
    stale.session.expiresAt = new Date(Date.now() + 60_000);
    const matching = {
      user: { ...stale.user, id: "other-user", email: "other@solace.test" },
      session: { ...stale.session, userId: "other-user", token: "other-token" },
    };
    mockGetSessionState.mockReturnValue({ data: stale });
    mockReadAuthSessionCache.mockResolvedValue(matching);
    jest.mocked(getSessionCookie).mockReturnValue("__Secure-better-auth.session_token=other-token.signature");
    mockGetSession.mockRejectedValueOnce(new Error("Offline"));

    await renderProvider();

    expect(getAuth().user?.id).toBe("other-user");
    expect(getAuth().session?.token).toBe("other-token");
  });

  it.each(["missing", 401, 403])("never restores cached authentication when the server rejects it (%s)", async (status) => {
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    mockGetSessionState.mockReturnValue({ data: cached });
    mockReadAuthSessionCache.mockResolvedValue(cached);
    mockGetSession.mockResolvedValueOnce(status === "missing"
      ? { data: null }
      : { data: null, error: { status } } as never);

    await renderProvider();
    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
    expect(mockClearAuthSessionCache).toHaveBeenCalled();
  });

  it("cannot restore an expired cached session or one without a stored cookie", async () => {
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() - 1);
    mockGetSessionState.mockReturnValue({ data: cached });
    mockGetSession.mockRejectedValueOnce(new Error("Offline"));
    await renderProvider();
    expect(getAuth().isAuthenticated).toBe(false);

    act(() => root.unmount());
    root = createRoot(container);
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    jest.mocked(getSessionCookie).mockReturnValueOnce("");
    mockGetSession.mockRejectedValueOnce(new Error("Offline"));
    await renderProvider();
    expect(getAuth().isAuthenticated).toBe(false);
  });

  it("cannot restore cached authentication after sign-out during a pending startup request", async () => {
    jest.useFakeTimers();
    const cached = createSessionData();
    cached.session.expiresAt = new Date(Date.now() + 60_000);
    mockGetSessionState.mockReturnValue({ data: cached });
    mockGetSession.mockImplementationOnce(() => new Promise(() => undefined));
    await renderProvider(false);
    await act(async () => { await getAuth().signOut(); });
    await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
  });

  it("accepts a successful sign-in response while cookie persistence catches up", async () => {
    mockWaitForSessionCookie.mockResolvedValue(false);
    mockGetSession.mockResolvedValue({ data: null });

    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().lastAuthMethod).toBe("email-password");
  });

  it("accepts Better Auth email sign-in payloads that only include user and token", async () => {
    mockEmailSignIn.mockResolvedValue(createEmailSignInResult());
    mockWaitForSessionCookie.mockResolvedValue(false);
    mockGetSession.mockResolvedValue({ data: null });

    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().session?.token).toBe("session-token");
    expect(getAuth().user?.email).toBe("roan@example.com");
  });

  it("keeps a successful sign-in when auth status is temporarily unavailable", async () => {
    await renderProvider();
    mockSignOut.mockClear();
    mockFetch.mockRejectedValueOnce(new Error("network"));

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().requiresPasskeyStepUp).toBe(false);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("restores a password session offline immediately after the first sign-in", async () => {
    await renderProvider();
    const saved = createSessionData();
    saved.session.expiresAt = new Date(Date.now() + 60_000);
    mockEmailSignIn.mockResolvedValue(createEmailSignInResult());
    mockGetSession.mockImplementation(async () => {
      mockReadAuthSessionCache.mockResolvedValue(saved);
      return { data: saved, error: null };
    });

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });
    expect(getAuth().isAuthenticated).toBe(true);

    act(() => root.unmount());
    root = createRoot(container);
    mockGetSessionState.mockReturnValue({ data: null });
    mockGetSession.mockRejectedValue(new Error("Offline"));
    await renderProvider();

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().session?.token).toBe(saved.session.token);
  });

  it("keeps an accepted password sign-in when the restart cache refresh fails", async () => {
    await renderProvider();
    mockEmailSignIn.mockResolvedValue(createEmailSignInResult());
    mockGetSession.mockRejectedValueOnce(new Error("Offline"));

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().user?.email).toBe("roan@example.com");
  });

  it("does not replace the accepted account with a stale session for another user", async () => {
    await renderProvider();
    mockEmailSignIn.mockResolvedValue(createEmailSignInResult());
    const stale = createSessionData();
    stale.user.id = "another-user";
    stale.user.email = "another@example.com";
    stale.session.userId = stale.user.id;
    mockGetSession.mockResolvedValueOnce({ data: stale, error: null });

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().user?.id).toBe("user-1");
    expect(getAuth().user?.email).toBe("roan@example.com");
  });

  it("finishes login when a lost sign-in response still created the requested session", async () => {
    await renderProvider();
    mockReadSessionTokenFromJar.mockResolvedValueOnce("existing-signed-cookie").mockResolvedValueOnce("new-signed-cookie");
    mockEmailSignIn.mockRejectedValueOnce(new Error("response lost"));
    mockGetSession.mockResolvedValueOnce(createAuthResult());

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(mockGetSession).toHaveBeenLastCalledWith({
      query: { disableCookieCache: true },
    });
    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().lastAuthMethod).toBe("email-password");
  });

  it("rejects an invalid password even when an existing session belongs to the same account", async () => {
    await renderProvider();
    mockEmailSignIn.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid email or password", status: 401, statusText: "Unauthorized" },
    });
    mockGetSession.mockResolvedValue(createAuthResult());

    await act(async () => {
      await expect(getAuth().signIn("roan@example.com", "wrong-password")).rejects.toThrow("Invalid email or password");
    });

    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().peekPendingAuthPassword()).toBeNull();
  });

  it("does not treat an unchanged session cookie as proof of a password after a network error", async () => {
    await renderProvider();
    mockEmailSignIn.mockRejectedValueOnce(new Error("response lost"));
    mockGetSession.mockResolvedValueOnce(createAuthResult());

    await act(async () => {
      await expect(getAuth().signIn("roan@example.com", "unverified-password")).rejects.toThrow("response lost");
    });

    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().peekPendingAuthPassword()).toBeNull();
  });

  it("keeps an uncached validated startup session when auth status is unavailable", async () => {
    mockGetSession.mockResolvedValue(createAuthResult());
    mockFetch.mockRejectedValueOnce(new Error("network"));

    await renderProvider();

    expect(mockGetSession).toHaveBeenCalledWith(expect.objectContaining({
      query: { disableCookieCache: true },
    }));
    expect(getAuth().isAuthenticated).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("requires passkey step-up on cold start when auth status says so", async () => {
    mockGetSession.mockResolvedValue(createAuthResult());
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: true,
      }),
    } as Response);

    await renderProvider();

    expect(mockFetch).toHaveBeenCalled();
    expect(getAuth().user).not.toBeNull();
    expect(getAuth().session).not.toBeNull();
    expect(getAuth().requiresPasskeyStepUp).toBe(true);
    expect(getAuth().isAuthenticated).toBe(false);
  });

  it("clears a stale pending password when passkey sign-in is used", async () => {
    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    await act(async () => {
      await getAuth().signInWithPasskey();
    });

    expect(mockPasskeySignIn).toHaveBeenCalled();
    expect(getAuth().lastAuthMethod).toBe("passkey");
    expect(getAuth().consumePendingAuthPassword()).toBeNull();
  });

  it("drops a recoverable device key when the server ends the session before startup ran", async () => {
    mockGetSession.mockResolvedValue({ data: null, error: null });

    await renderProvider();
    await flushPromises();

    expect(mockClearRecoverableStoredDevice).toHaveBeenCalledTimes(1);
    expect(mockOnSignedOut).toHaveBeenCalled();
  });

  it("clears pending auth hints on sign-out", async () => {
    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    await act(async () => {
      await getAuth().signOut();
    });
    await flushPromises();

    expect(mockUnregisterNativePushDevice).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockOnSignedOut).toHaveBeenCalled();
    expect(mockClearNativeTitleIndex).toHaveBeenCalled();
    expect(mockClearRecoverableStoredDevice).toHaveBeenCalled();
    expect(getAuth().lastAuthMethod).toBe("unknown");
    expect(getAuth().consumePendingAuthPassword()).toBeNull();
  });

  it("drops the decrypted query cache when the session ends", async () => {
    await renderProvider();
    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });
    queryClient.setQueryData(["decrypted-for-test"], { title: "Dentist" });

    await act(async () => {
      await getAuth().signOut();
    });

    expect(queryClient.getQueryData(["decrypted-for-test"])).toBeUndefined();
  });

  it("ends the session with its notice even when a cleanup step fails", async () => {
    await renderProvider();
    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });
    mockOnSignedOut.mockRejectedValueOnce(new Error("cleanup failed"));

    await act(async () => {
      await expect(getAuth().signOut("Sign in again.")).rejects.toThrow(
        "cleanup failed",
      );
    });

    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().signInNotice).toBe("Sign in again.");
  });

  it("keeps the sign-out notice for the sign-in screen until the next sign-in", async () => {
    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });
    await act(async () => {
      await getAuth().signOut("Sign in again.");
    });
    await flushPromises();
    expect(getAuth().signInNotice).toBe("Sign in again.");

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });
    expect(getAuth().signInNotice).toBeNull();
  });

  it("authenticates logout requests with the fallback token when the cookie jar is empty", async () => {
    mockGetSession.mockResolvedValue(createAuthResult());
    await renderProvider();
    expect(getFallbackSessionToken()).toBe("session-token");
    jest.mocked(getSessionCookie).mockImplementation(() => {
      const fallback = getFallbackSessionToken();
      return fallback ? `better-auth.session_token=${fallback}` : "";
    });

    try {
      await act(async () => {
        await getAuth().signOut();
      });
    } finally {
      jest.mocked(getSessionCookie).mockImplementation(
        () => "better-auth.session=token",
      );
    }

    const cookie = "better-auth.session_token=session-token";
    expect(mockUnregisterNativePushDevice).toHaveBeenCalledWith(
      expect.objectContaining({ cookie }),
    );
    expect(mockSignOut).toHaveBeenCalledWith({
      fetchOptions: { headers: { cookie } },
    });
    expect(getFallbackSessionToken()).toBeNull();
  });

  it("deletes the server row of a device key sign-out removes, before the session ends", async () => {
    mockRecoverableStoredDeviceId.mockResolvedValueOnce("native-device-1");
    const deleteRow = jest
      .spyOn(calendarApiService, "deleteE2eeDevice")
      .mockResolvedValue({ success: true, message: "Encryption device removed" });
    mockSignOut.mockImplementationOnce(async () => {
      expect(deleteRow).toHaveBeenCalledWith(
        "native-device-1",
        expect.objectContaining({ cookie: expect.any(String) }),
      );
      return { data: { success: true }, error: null } as never;
    });
    await renderProvider();

    await act(async () => {
      await getAuth().signOut();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockClearRecoverableStoredDevice).toHaveBeenCalled();
    deleteRow.mockRestore();
  });

  it("keeps the same user object when a renewal returns the same user", async () => {
    jest.useFakeTimers();
    mockGetSession.mockImplementation(async () => createAuthResult());
    await renderProvider();
    const user = getAuth().user;
    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1000); });
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(getAuth().user).toBe(user);
    jest.useRealTimers();
  });

  it("renews hourly and on resume, retaining the session on network failure", async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(createAuthResult());
    await renderProvider();
    mockGetSession.mockRejectedValueOnce(new Error("Offline"));
    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1000); });
    expect(getAuth().isAuthenticated).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();
    const listener = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1];
    await act(async () => { listener?.("active"); });
    expect(mockGetSession).toHaveBeenCalledTimes(3);
    expect(getAuth().isAuthenticated).toBe(true);
    jest.useRealTimers();
  });

  it.each(["push unregister", "signed-out cleanup"])(
    "clears the fallback token before waiting for %s even when server sign-out fails",
    async (phase) => {
      mockGetSession.mockResolvedValue(createAuthResult());
      await renderProvider();
      expect(getFallbackSessionToken()).toBe("session-token");
      let finishCleanup: () => void = () => {};
      const cleanup = new Promise<void>((resolve) => {
        finishCleanup = resolve;
      });
      if (phase === "push unregister") {
        mockUnregisterNativePushDevice.mockImplementationOnce(() => cleanup);
      } else {
        mockOnSignedOut.mockImplementationOnce(() => cleanup);
      }
      mockSignOut.mockRejectedValueOnce(new Error("Fixture sign-out unavailable"));
      let pendingLogout: Promise<void> | undefined;
      await act(async () => {
        pendingLogout = getAuth().signOut();
      });
      try {
        if (phase === "signed-out cleanup") {
          expect(mockOnSignedOut).toHaveBeenCalledTimes(1);
        }
        expect(getFallbackSessionToken()).toBeNull();
      } finally {
        await act(async () => {
          finishCleanup();
          await pendingLogout;
        });
      }
      expect(getAuth().isAuthenticated).toBe(false);
    },
  );

  it("ignores a renewal response that arrives after sign-out", async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(createAuthResult());
    await renderProvider();
    let completeRefresh: (result: ReturnType<typeof createAuthResult>) => void = () => {};
    mockGetSession.mockImplementationOnce(() => new Promise((resolve) => { completeRefresh = resolve; }));
    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1000); });
    const onSuccess = mockGetSession.mock.calls.at(-1)?.[0]?.fetchOptions?.onSuccess;
    expect(onSuccess).toBeDefined();
    await act(async () => { await getAuth().signOut(); });
    expect(() => onSuccess?.({
      data: createSessionData(),
      response: {} as Response,
      request: { url: "https://api.solace.test/api/auth/get-session", headers: new Headers(), body: null, method: "GET", signal: new AbortController().signal },
    })).toThrow("Session changed while renewing.");
    await act(async () => { completeRefresh(createAuthResult()); });
    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
    const count = mockGetSession.mock.calls.length;
    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1000); });
    expect(mockGetSession).toHaveBeenCalledTimes(count);
    jest.useRealTimers();
  });

  it("pauses hourly refresh while backgrounded and renews immediately on resume", async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(createAuthResult());
    await renderProvider();
    AppState.currentState = "background";
    await act(async () => { await jest.advanceTimersByTimeAsync(2 * 60 * 60 * 1000); });
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(getAuth().isAuthenticated).toBe(true);
    AppState.currentState = "active";
    const listener = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1];
    await act(async () => { listener?.("active"); });
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(getAuth().isLoading).toBe(false);
  });

  it("shares overlapping resume and timer refreshes", async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(createAuthResult());
    await renderProvider();
    let completeRefresh: (result: ReturnType<typeof createAuthResult>) => void = () => {};
    mockGetSession.mockImplementationOnce(() => new Promise((resolve) => { completeRefresh = resolve; }));
    const listener = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1];
    await act(async () => {
      listener?.("active");
      listener?.("active");
      await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    });
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    await act(async () => { completeRefresh(createAuthResult()); });
    await act(async () => { listener?.("active"); });
    expect(mockGetSession).toHaveBeenCalledTimes(3);
    expect(getAuth().isAuthenticated).toBe(true);
  });

  it("retains a live session when background validation returns a server error", async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(createAuthResult());
    await renderProvider();
    mockGetSession.mockResolvedValueOnce({ data: null, error: { status: 503, message: "Fixture unavailable" } } as never);
    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1000); });
    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().user?.id).toBe("user-1");
    expect(getAuth().isLoading).toBe(false);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("clears a revoked session and stops background renewal", async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue(createAuthResult());
    await renderProvider();
    mockGetSession.mockResolvedValueOnce({ data: null, error: null });
    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1000); });
    expect(getAuth().isAuthenticated).toBe(false);
    expect(getAuth().user).toBeNull();
    const count = mockGetSession.mock.calls.length;
    await act(async () => { await jest.advanceTimersByTimeAsync(60 * 60 * 1000); });
    expect(mockGetSession).toHaveBeenCalledTimes(count);
  });

  it("opens passkey verification after password sign-in without clearing the pending password", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          hasPasskeys: true,
          requiresPasskeyStepUp: true,
        }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          authenticated: true,
          hasPasskeys: true,
          requiresPasskeyStepUp: false,
        }),
      } as Response);

    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(mockPasskeySignIn).toHaveBeenCalled();
    expect(getAuth().lastAuthMethod).toBe("email-password");
    expect(getAuth().consumePendingAuthPassword()).toBe("secret-password");
    expect(getAuth().requiresPasskeyStepUp).toBe(false);
    expect(getAuth().isAuthenticated).toBe(true);
  });

  it("uses the browser passkey popup for native step-up after password sign-in", async () => {
    mockGetAuthCapabilities.mockReturnValue({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage: null,
    });
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          hasPasskeys: true,
          requiresPasskeyStepUp: true,
        }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          authenticated: true,
          hasPasskeys: true,
          requiresPasskeyStepUp: false,
        }),
      } as Response);

    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(mockSignInWithBrowserPasskey).toHaveBeenCalled();
    expect(mockPasskeySignIn).not.toHaveBeenCalled();
    expect(getAuth().lastAuthMethod).toBe("email-password");
    expect(getAuth().consumePendingAuthPassword()).toBe("secret-password");
    expect(getAuth().isAuthenticated).toBe(true);
  });

  it("keeps the session unauthenticated until passkey verification finishes", async () => {
    mockGetAuthCapabilities.mockReturnValue({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage: null,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: true,
      }),
    } as Response);

    let releasePasskey: (value: ReturnType<typeof createSessionData>) => void =
      () => {};
    mockSignInWithBrowserPasskey.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePasskey = resolve;
        }),
    );

    await renderProvider();

    let signInPromise: Promise<{ requiresPasskeyStepUp: boolean }> | undefined;
    await act(async () => {
      signInPromise = getAuth().signIn("roan@example.com", "secret-password");
      await Promise.resolve();
    });

    expect(getAuth().isAuthenticated).toBe(false);
    expect(mockSignInWithBrowserPasskey).toHaveBeenCalled();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: false,
      }),
    } as Response);

    await act(async () => {
      releasePasskey(createSessionData());
      await signInPromise;
    });

    expect(getAuth().isAuthenticated).toBe(true);
  });

  it("keeps the password session when passkey verification is cancelled", async () => {
    mockGetAuthCapabilities.mockReturnValue({
      supportsPassword: true,
      supportsGitHubOAuth: true,
      supportsPasskeys: true,
      passkeyMode: "browser-bridge",
      passkeyMessage: null,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: true,
      }),
    } as Response);
    mockSignInWithBrowserPasskey.mockRejectedValue(
      new Error("Passkey verification was cancelled."),
    );

    await renderProvider();

    let thrown: unknown;
    await act(async () => {
      try {
        await getAuth().signIn("roan@example.com", "secret-password");
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toEqual(new Error("Passkey verification was cancelled."));
    expect(getAuth().lastAuthMethod).toBe("email-password");
    expect(getAuth().consumePendingAuthPassword()).toBe("secret-password");
    expect(getAuth().requiresPasskeyStepUp).toBe(true);
    expect(getAuth().isAuthenticated).toBe(false);
  });
});
