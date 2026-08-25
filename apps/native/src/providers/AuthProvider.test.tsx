/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { authClient } from "../lib/auth-client";
import { getAuthCapabilities } from "../lib/auth-capabilities";
import { waitForSessionCookie } from "../lib/session-cookie";
import { signInWithBrowserPasskey } from "../lib/passkey-browser-bridge";
import { AuthProvider, useAuth } from "./AuthProvider";

jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
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
  authClient: {
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
  getSessionCookie: jest.fn(() => "better-auth.session=token"),
  waitForSessionCookie: jest.fn(),
}));

jest.mock("../lib/mail/mail-password-cache", () => ({
  saveMailVaultPassword: jest.fn(),
  clearMailVaultPassword: jest.fn(),
  clearDerivedVaultKey: jest.fn(),
  clearCachedPrivateKey: jest.fn(),
}));

jest.mock("../lib/mail/mail-crypto", () => ({
  clearVaultCache: jest.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type AuthContextValue = ReturnType<typeof useAuth>;

const mockGetSession = jest.mocked(authClient.getSession);
const mockEmailSignIn = jest.mocked(authClient.signIn.email);
const mockSocialSignIn = jest.mocked(authClient.signIn.social);
const mockPasskeySignIn = jest.mocked(authClient.signIn.passkey);
const mockEmailSignUp = jest.mocked(authClient.signUp.email);
const mockSignOut = jest.mocked(authClient.signOut);
const mockGetAuthCapabilities = jest.mocked(getAuthCapabilities);
const mockWaitForSessionCookie = jest.mocked(waitForSessionCookie);
const mockSignInWithBrowserPasskey = jest.mocked(signInWithBrowserPasskey);
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

  async function renderProvider() {
    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>,
      );
      await Promise.resolve();
    });

    expect(capturedAuth?.isLoading).toBe(false);
  }

  function getAuth() {
    if (!capturedAuth) {
      throw new Error("Auth context was not captured.");
    }

    return capturedAuth;
  }

  beforeEach(() => {
    global.fetch = mockFetch as typeof fetch;
    capturedAuth = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockGetSession.mockReset();
    mockEmailSignIn.mockReset();
    mockSocialSignIn.mockReset();
    mockPasskeySignIn.mockReset();
    mockEmailSignUp.mockReset();
    mockSignOut.mockReset();
    mockGetAuthCapabilities.mockReset();
    mockWaitForSessionCookie.mockReset();
    mockSignInWithBrowserPasskey.mockReset();

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
  });

  it("stores the email sign-in password as the pending encryption password", async () => {
    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().lastAuthMethod).toBe("email-password");
    expect(getAuth().consumePendingAuthPassword()).toBe("secret-password");
    expect(getAuth().consumePendingAuthPassword()).toBeNull();
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

  it("accepts a successful sign-in response while cookie persistence catches up", async () => {
    mockWaitForSessionCookie.mockResolvedValue(false);
    mockGetSession.mockResolvedValue({ data: null });

    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    expect(getAuth().isAuthenticated).toBe(true);
    expect(getAuth().lastAuthMethod).toBe("email-password");
    expect(mockWaitForSessionCookie).not.toHaveBeenCalled();
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

  it("finishes login when a lost sign-in response still created the requested session", async () => {
    await renderProvider();
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

  it("keeps an uncached validated startup session when auth status is unavailable", async () => {
    mockGetSession.mockResolvedValue(createAuthResult());
    mockFetch.mockRejectedValueOnce(new Error("network"));

    await renderProvider();

    expect(mockGetSession).toHaveBeenCalledWith({
      query: { disableCookieCache: true },
    });
    expect(getAuth().isAuthenticated).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();
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

  it("clears pending auth hints on sign-out", async () => {
    await renderProvider();

    await act(async () => {
      await getAuth().signIn("roan@example.com", "secret-password");
    });

    await act(async () => {
      await getAuth().signOut();
    });
    await flushPromises();

    expect(mockSignOut).toHaveBeenCalled();
    expect(getAuth().lastAuthMethod).toBe("unknown");
    expect(getAuth().consumePendingAuthPassword()).toBeNull();
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
