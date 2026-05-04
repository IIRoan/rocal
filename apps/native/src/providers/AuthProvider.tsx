import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { authClient } from "../lib/auth-client";
import { CALENDAR_HOME_ROUTE } from "../lib/auth-routing";
import { getAuthCapabilities } from "../lib/auth-capabilities";
import {
  deleteStoredPasskey,
  getDefaultPasskeyName,
} from "../lib/passkey-auth";
import {
  isPasskeyBridgeOriginSecure,
  registerBrowserPasskey,
  resolvePasskeyBridgeBaseUrl,
  signInWithBrowserPasskey,
} from "../lib/passkey-browser-bridge";
import { waitForSessionCookie } from "../lib/session-cookie";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

interface Session {
  token: string;
  userId: string;
  expiresAt: Date;
}

export interface AuthContextValue {
  /** The currently authenticated user, or null. */
  user: User | null;
  /** The active session, or null. */
  session: Session | null;
  /** True while the initial session check is in progress. */
  isLoading: boolean;
  /** Convenience flag — true when user and session are present. */
  isAuthenticated: boolean;
  /** Sign in with email and password. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Create a new account. */
  signUp: (name: string, email: string, password: string) => Promise<void>;
  /** Sign in with GitHub OAuth. */
  signInWithGitHub: (options?: { requestSignUp?: boolean }) => Promise<void>;
  /** Sign out and clear the session. */
  signOut: () => Promise<void>;
  /** Authenticate using platform biometrics (passkey). */
  signInWithPasskey: () => Promise<void>;
  /** Register a passkey for the current account. */
  registerPasskey: () => Promise<void>;
  /** Delete a passkey from the current account. */
  deletePasskey: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authCapabilities = useMemo(
    () => {
      const passkeyBridgeBaseUrl = resolvePasskeyBridgeBaseUrl();

      return getAuthCapabilities({
        platformOs: Platform.OS,
        expoExecutionEnvironment: Constants.executionEnvironment,
        expoAppOwnership: Constants.appOwnership,
        hasPublicKeyCredential:
          typeof globalThis.PublicKeyCredential === "function",
        hasSecurePasskeyBridgeOrigin:
          isPasskeyBridgeOriginSecure(passkeyBridgeBaseUrl),
      });
    },
    [],
  );

  // ── Session hydration ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const result = await authClient.getSession();
        if (!cancelled && result?.data) {
          setUser(result.data.user as User);
          setSession((result.data as any).session as Session);
        }
      } catch {
        // No valid session — stay unauthenticated.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Auth actions ─────────────────────────────────────────────────────

  const applySessionData = useCallback(
    (data: unknown) => {
      const typedData = data as
        | {
            user?: User;
            session?: Session;
          }
        | undefined;

      if (!typedData?.user || !typedData.session) return false;
      setUser(typedData.user);
      setSession(typedData.session);
      return true;
    },
    [setUser, setSession],
  );

  const finalizeAuthenticatedSession = useCallback(
    async (data: unknown, errorPrefix: string) => {
      const hasSessionCookie = await waitForSessionCookie();

      if (hasSessionCookie && applySessionData(data)) return;

      const sessionResult = await authClient.getSession();
      if (applySessionData(sessionResult?.data)) return;

      throw new Error(
        `${errorPrefix} succeeded, but session setup did not complete. Please try again.`,
      );
    },
    [applySessionData],
  );

  const clearSession = useCallback(() => {
    setUser(null);
    setSession(null);
  }, []);

  // Register the clear-session callback so the HTTP layer can terminate
  // sessions on 401/403 without a React hook.
  useEffect(() => {
    registerClearSession(clearSession);
    return () => {
      registerClearSession(() => {});
    };
  }, [clearSession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authClient.signIn.email({ email, password });

      if (result.error) {
        throw new Error(
          result.error.message ?? "Sign-in failed. Please try again.",
        );
      }

      await finalizeAuthenticatedSession(result.data, "Sign-in");
    },
    [finalizeAuthenticatedSession],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        throw new Error(
          result.error.message ?? "Sign-up failed. Please try again.",
        );
      }

      await finalizeAuthenticatedSession(result.data, "Sign-up");
    },
    [finalizeAuthenticatedSession],
  );

  const signInWithGitHub = useCallback(
    async (options?: { requestSignUp?: boolean }) => {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: CALENDAR_HOME_ROUTE,
        ...(options?.requestSignUp ? { requestSignUp: true } : {}),
      });

      if (result.error) {
        throw new Error(
          result.error.message ?? "GitHub sign-in failed. Please try again.",
        );
      }

      await finalizeAuthenticatedSession(result.data, "GitHub sign-in");
    },
    [finalizeAuthenticatedSession],
  );

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Best-effort — clear local state regardless.
    }
    clearSession();
  }, [clearSession]);

  const signInWithPasskey = useCallback(async () => {
    if (!authCapabilities.supportsPasskeys) {
      throw new Error(
        authCapabilities.passkeyMessage ??
          "Passkey sign-in failed. Please try again.",
      );
    }

    if (authCapabilities.passkeyMode === "web") {
      const result = await authClient.signIn.passkey();

      if (result.error) {
        throw new Error(
          typeof result.error.message === "string"
            ? result.error.message
            : "Passkey sign-in failed. Please try again.",
        );
      }

      await finalizeAuthenticatedSession(result.data, "Passkey sign-in");
      return;
    }

    if (authCapabilities.passkeyMode === "browser-bridge") {
      const result = await signInWithBrowserPasskey(authClient);

      await finalizeAuthenticatedSession(result, "Passkey sign-in");
      return;
    }

    throw new Error("Passkey sign-in failed. Please try again.");
  }, [authCapabilities, finalizeAuthenticatedSession]);

  const registerPasskey = useCallback(async () => {
    if (!authCapabilities.supportsPasskeys) {
      throw new Error(
        authCapabilities.passkeyMessage ??
          "Unable to finish passkey setup.",
      );
    }

    if (authCapabilities.passkeyMode === "web") {
      const result = await authClient.passkey.addPasskey({
        name: getDefaultPasskeyName(Platform.OS),
        authenticatorAttachment: "platform",
      });

      if (result.error) {
        throw new Error(
          typeof result.error.message === "string"
            ? result.error.message
            : "Unable to finish passkey setup.",
        );
      }

      return;
    }

    if (authCapabilities.passkeyMode === "browser-bridge") {
      await registerBrowserPasskey(
        authClient,
        getDefaultPasskeyName(Platform.OS),
      );
      return;
    }

    throw new Error("Unable to finish passkey setup.");
  }, [authCapabilities]);


  const deletePasskey = useCallback(async (id: string) => {
    await deleteStoredPasskey(authClient, id);
  }, []);

  // ── Context value ────────────────────────────────────────────────────

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: !!user && !!session,
      signIn,
      signUp,
      signInWithGitHub,
      signOut,
      signInWithPasskey,
      registerPasskey,
      deletePasskey,
    }),
    [
      user,
      session,
      isLoading,
      signIn,
      signUp,
      signInWithGitHub,
      signOut,
      signInWithPasskey,
      registerPasskey,
      deletePasskey,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Utility — call from HTTP interceptors on 401/403
// ---------------------------------------------------------------------------

/**
 * Force-clear the auth state from outside the React tree.
 *
 * This is exposed so that the HTTP client's `getHeaders` callback (or a
 * response interceptor) can terminate the session on 401/403 without
 * needing a React hook.
 */
let _clearSessionRef: (() => void) | null = null;

export function registerClearSession(fn: () => void) {
  _clearSessionRef = fn;
}

export function triggerSessionClear() {
  _clearSessionRef?.();
}

/**
 * Internal provider wrapper that registers the clearSession ref.
 * Used by AuthProvider above.
 */
export function AuthProviderWithClearRef({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthProvider>{children}</AuthProvider>;
}
