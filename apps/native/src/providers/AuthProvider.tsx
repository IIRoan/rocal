import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  use,
} from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { authClient } from "../lib/auth-client";
import { getAuthCapabilities } from "../lib/auth-capabilities";
import { API_BASE_URL } from "../lib/constants";
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
import { getSessionCookie, waitForSessionCookie } from "../lib/session-cookie";

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

export type AuthMethod = "email-password" | "passkey" | "unknown";
type SignInResult = { requiresPasskeyStepUp: boolean };

export interface AuthContextValue {
  /** The currently authenticated user, or null. */
  user: User | null;
  /** The active session, or null. */
  session: Session | null;
  /** True while the initial session check is in progress. */
  isLoading: boolean;
  /** Convenience flag — true when user and session are present. */
  isAuthenticated: boolean;
  /** True when the user must complete a registered passkey challenge. */
  requiresPasskeyStepUp: boolean;
  /** The auth method used for the current session when known. */
  lastAuthMethod: AuthMethod;
  /** Sign in with email and password. */
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** Create a new account. */
  signUp: (name: string, email: string, password: string) => Promise<void>;
  /** Sign out and clear the session. */
  signOut: () => Promise<void>;
  /** Authenticate using platform biometrics (passkey). */
  signInWithPasskey: () => Promise<void>;
  /** Register a passkey for the current account. */
  registerPasskey: () => Promise<void>;
  /** Delete a passkey from the current account. */
  deletePasskey: (id: string) => Promise<void>;
  /** Retrieve and clear the pending email/password sign-in password. */
  consumePendingAuthPassword: () => string | null;
  /** Clear any pending email/password sign-in password. */
  clearPendingAuthPassword: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthProviderState() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastAuthMethod, setLastAuthMethod] = useState<AuthMethod>("unknown");
  const [requiresPasskeyStepUp, setRequiresPasskeyStepUp] = useState(false);
  const pendingAuthPasswordRef = useRef<string | null>(null);
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

  const fetchAuthStatus = useCallback(async () => {
    const cookie = getSessionCookie();
    const response = await fetch(`${API_BASE_URL}/api/account/auth-status`, {
      credentials: "include",
      headers: cookie ? { cookie } : undefined,
    });

    if (!response.ok) {
      throw new Error("Unable to load authentication status.");
    }

    return (await response.json()) as {
      authenticated: boolean;
      hasPasskeys: boolean;
      requiresPasskeyStepUp: boolean;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const result = await authClient.getSession();
        if (!cancelled && result?.data) {
          setUser(result.data.user as User);
          setSession((result.data as any).session as Session);
          const authStatus = await fetchAuthStatus();
          if (!cancelled) {
            setRequiresPasskeyStepUp(authStatus.requiresPasskeyStepUp);
          }
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
  }, [fetchAuthStatus]);

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

  const clearPendingAuthPassword = useCallback(() => {
    pendingAuthPasswordRef.current = null;
  }, []);

  const consumePendingAuthPassword = useCallback(() => {
    const pendingPassword = pendingAuthPasswordRef.current;
    pendingAuthPasswordRef.current = null;
    return pendingPassword;
  }, []);

  const resetAuthMethodHints = useCallback(() => {
    pendingAuthPasswordRef.current = null;
    setLastAuthMethod("unknown");
    setRequiresPasskeyStepUp(false);
  }, []);

  const setEmailPasswordAuthHints = useCallback((password: string) => {
    pendingAuthPasswordRef.current = password;
    setLastAuthMethod("email-password");
  }, []);

  const setProviderAuthHints = useCallback((method: "passkey") => {
    pendingAuthPasswordRef.current = null;
    setLastAuthMethod(method);
  }, []);

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
    resetAuthMethodHints();
  }, [resetAuthMethodHints]);

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

      setEmailPasswordAuthHints(password);

      try {
        await finalizeAuthenticatedSession(result.data, "Sign-in");
        const authStatus = await fetchAuthStatus();
        setRequiresPasskeyStepUp(authStatus.requiresPasskeyStepUp);
        return { requiresPasskeyStepUp: authStatus.requiresPasskeyStepUp };
      } catch (error) {
        resetAuthMethodHints();
        throw error;
      }
    },
    [
      fetchAuthStatus,
      finalizeAuthenticatedSession,
      resetAuthMethodHints,
      setEmailPasswordAuthHints,
    ],
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

      setEmailPasswordAuthHints(password);

      try {
        await finalizeAuthenticatedSession(result.data, "Sign-up");
        setRequiresPasskeyStepUp(false);
      } catch (error) {
        resetAuthMethodHints();
        throw error;
      }
    },
    [finalizeAuthenticatedSession, resetAuthMethodHints, setEmailPasswordAuthHints],
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
        setProviderAuthHints("passkey");
        const result = await authClient.signIn.passkey();

      if (result.error) {
        throw new Error(
          typeof result.error.message === "string"
            ? result.error.message
            : "Passkey sign-in failed. Please try again.",
        );
      }

        try {
          await finalizeAuthenticatedSession(result.data, "Passkey sign-in");
          const authStatus = await fetchAuthStatus();
          setRequiresPasskeyStepUp(authStatus.requiresPasskeyStepUp);
        } catch (error) {
          resetAuthMethodHints();
          throw error;
        }
        return;
      }

      if (authCapabilities.passkeyMode === "browser-bridge") {
        setProviderAuthHints("passkey");
        const result = await signInWithBrowserPasskey(authClient);

        try {
          await finalizeAuthenticatedSession(result, "Passkey sign-in");
          const authStatus = await fetchAuthStatus();
          setRequiresPasskeyStepUp(authStatus.requiresPasskeyStepUp);
        } catch (error) {
          resetAuthMethodHints();
          throw error;
        }
        return;
      }

    throw new Error("Passkey sign-in failed. Please try again.");
  }, [
    authCapabilities,
    fetchAuthStatus,
    finalizeAuthenticatedSession,
    resetAuthMethodHints,
    setProviderAuthHints,
  ]);

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: !!user && !!session && !requiresPasskeyStepUp,
      requiresPasskeyStepUp,
      lastAuthMethod,
      signIn,
      signUp,
      signOut,
      signInWithPasskey,
      registerPasskey,
      deletePasskey,
      consumePendingAuthPassword,
      clearPendingAuthPassword,
    }),
    [
      user,
      session,
      isLoading,
      requiresPasskeyStepUp,
      lastAuthMethod,
      signIn,
      signUp,
      signOut,
      signInWithPasskey,
      registerPasskey,
      deletePasskey,
      consumePendingAuthPassword,
      clearPendingAuthPassword,
    ],
  );

  return value;
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const value = useAuthProviderState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

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
