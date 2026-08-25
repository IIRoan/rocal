import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { authClient } from "../lib/auth-client";
import { getAuthCapabilities } from "../lib/auth-capabilities";
import { API_BASE_URL } from "../lib/constants";
import { getAuthHeaders } from "../lib/api";
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
import {
  saveMailVaultPassword,
  clearMailVaultPassword,
  clearDerivedVaultKey,
  clearCachedPrivateKey,
} from "../lib/mail/mail-password-cache";
import { clearVaultCache } from "../lib/mail/mail-crypto";
import { registerClearSession } from "../lib/session-clear";

const AUTH_STATUS_TIMEOUT_MS = 3_000;
const AUTH_STATUS_RETRY_DELAYS_MS = [0, 150, 400] as const;

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
  /** Verify a registered passkey after email/password sign-in. */
  completePasskeyStepUp: () => Promise<void>;
  /** Register a passkey for the current account. */
  registerPasskey: () => Promise<void>;
  /** Delete a passkey from the current account. */
  deletePasskey: (id: string) => Promise<void>;
  /** Retrieve and clear the pending email/password sign-in password. */
  consumePendingAuthPassword: () => string | null;
  /** Clear any pending email/password sign-in password. */
  clearPendingAuthPassword: () => void;
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
  const [lastAuthMethod, setLastAuthMethod] = useState<AuthMethod>("unknown");
  const [requiresPasskeyStepUp, setRequiresPasskeyStepUp] = useState(false);
  const pendingAuthPasswordRef = useRef<string | null>(null);
  const authCapabilities = useMemo(() => {
    const passkeyBridgeBaseUrl = resolvePasskeyBridgeBaseUrl();

    return getAuthCapabilities({
      platformOs: Platform.OS,
      hasPublicKeyCredential:
        typeof globalThis.PublicKeyCredential === "function",
      hasSecurePasskeyBridgeOrigin:
        isPasskeyBridgeOriginSecure(passkeyBridgeBaseUrl),
    });
  }, []);

  // ── Session hydration ────────────────────────────────────────────────
  const fetchAuthStatus = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      AUTH_STATUS_TIMEOUT_MS,
    );
    let response: Response;

    try {
      response = await fetch(`${API_BASE_URL}/api/account/auth-status`, {
        credentials: "omit",
        headers: getAuthHeaders(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error("Unable to load authentication status.");
    }

    return (await response.json()) as {
      authenticated: boolean;
      hasPasskeys: boolean;
      requiresPasskeyStepUp: boolean;
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
      // A successful Better Auth response already contains the authoritative
      // session. Cookie persistence may finish just after the response on
      // native, so it must not turn that success into a login failure.
      if (applySessionData(data)) return;

      await waitForSessionCookie();
      const sessionResult = await authClient.getSession({
        query: { disableCookieCache: true },
      });
      if (applySessionData(sessionResult?.data)) return;

      throw new Error(
        `${errorPrefix} succeeded, but session setup did not complete. Please try again.`,
      );
    },
    [applySessionData],
  );

  const syncPasskeyStepUpAfterAuth = useCallback(async () => {
    try {
      const authStatus = await fetchAuthStatus();
      const requiresStepUp =
        authStatus.authenticated && authStatus.requiresPasskeyStepUp;
      setRequiresPasskeyStepUp(requiresStepUp);
      return requiresStepUp;
    } catch {
      // Password/passkey authentication already succeeded. The status request
      // is only a follow-up for step-up UI and must not undo the new session.
      setRequiresPasskeyStepUp(false);
      return false;
    }
  }, [fetchAuthStatus]);

  const waitForPasskeyStepUpToClear = useCallback(async () => {
    for (const delayMs of AUTH_STATUS_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const authStatus = await fetchAuthStatus();
        const requiresStepUp =
          authStatus.authenticated && authStatus.requiresPasskeyStepUp;
        if (!requiresStepUp) {
          setRequiresPasskeyStepUp(false);
          return;
        }
      } catch {
        // Retry while cookie persistence catches up.
      }
    }

    setRequiresPasskeyStepUp(false);
  }, [fetchAuthStatus]);

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

  const completePasskeyStepUp = useCallback(async () => {
    if (!authCapabilities.supportsPasskeys) {
      throw new Error(
        authCapabilities.passkeyMessage ??
          "Passkey verification failed. Please try again.",
      );
    }

    if (authCapabilities.passkeyMode === "web") {
      const result = await authClient.signIn.passkey();

      if (result.error) {
        throw new Error(
          typeof result.error.message === "string"
            ? result.error.message
            : "Passkey verification failed. Please try again.",
        );
      }

      applySessionData(result.data);
      await waitForPasskeyStepUpToClear();
      return;
    }

    if (authCapabilities.passkeyMode === "browser-bridge") {
      const result = await signInWithBrowserPasskey(authClient);
      applySessionData(result);
      await waitForPasskeyStepUpToClear();
      return;
    }

    throw new Error("Passkey verification failed. Please try again.");
  }, [
    applySessionData,
    authCapabilities,
    waitForPasskeyStepUpToClear,
  ]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      let authData: unknown;
      try {
        const result = await authClient.signIn.email({ email, password });

        if (result.error) {
          throw new Error(
            result.error.message ?? "Sign-in failed. Please try again.",
          );
        }

        authData = result.data;
      } catch (error) {
        let recoveredSession: Awaited<
          ReturnType<typeof authClient.getSession>
        > | null = null;
        try {
          recoveredSession = await authClient.getSession({
            query: { disableCookieCache: true },
          });
        } catch {
          // Preserve the original sign-in error below.
        }

        const requestedEmail = email.trim().toLowerCase();
        const recoveredEmail = recoveredSession?.data?.user.email
          ?.trim()
          .toLowerCase();
        if (!recoveredSession?.data || recoveredEmail !== requestedEmail) {
          throw error;
        }

        authData = recoveredSession.data;
      }

      try {
        await finalizeAuthenticatedSession(authData, "Sign-in");
        setEmailPasswordAuthHints(password);
        // Persist password to SecureStore so the mail vault can be unlocked
        // even after an app restart (in-memory ref is lost on restart).
        await saveMailVaultPassword(password);
      } catch (error) {
        resetAuthMethodHints();
        throw error;
      }

      const requiresStepUp = await syncPasskeyStepUpAfterAuth();
      if (requiresStepUp) {
        if (!authCapabilities.supportsPasskeys) {
          return { requiresPasskeyStepUp: true };
        }

        await completePasskeyStepUp();
      }

      return { requiresPasskeyStepUp: false };
    },
    [
      authCapabilities.supportsPasskeys,
      completePasskeyStepUp,
      finalizeAuthenticatedSession,
      resetAuthMethodHints,
      setEmailPasswordAuthHints,
      syncPasskeyStepUpAfterAuth,
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

      try {
        await finalizeAuthenticatedSession(result.data, "Sign-up");
        setEmailPasswordAuthHints(password);
        // Persist password to SecureStore (mirrors signIn behaviour above).
        await saveMailVaultPassword(password);
        setRequiresPasskeyStepUp(false);
      } catch (error) {
        resetAuthMethodHints();
        throw error;
      }
    },
    [
      finalizeAuthenticatedSession,
      resetAuthMethodHints,
      setEmailPasswordAuthHints,
    ],
  );

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Best-effort — clear local state regardless.
    }
    // Clear the persisted mail vault password, derived key, cached PGP key, and in-memory vault cache.
    await clearMailVaultPassword();
    await clearDerivedVaultKey();
    await clearCachedPrivateKey();
    clearVaultCache();
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const result = await authClient.getSession({
          query: { disableCookieCache: true },
        });
        if (!cancelled && result?.data) {
          setUser(result.data.user as User);
          setSession((result.data as any).session as Session);
          try {
            const authStatus = await fetchAuthStatus();
            if (!cancelled) {
              if (!authStatus.authenticated) {
                await signOut();
              } else {
                setRequiresPasskeyStepUp(authStatus.requiresPasskeyStepUp);
              }
            }
          } catch {
            // Keep a session that Better Auth just validated. A temporary
            // status failure is not evidence that the user signed out.
          }
        } else {
          if (!cancelled) {
            await signOut();
          }
        }
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, [clearSession, fetchAuthStatus, signOut]);

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
        await syncPasskeyStepUpAfterAuth();
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
        await syncPasskeyStepUpAfterAuth();
      } catch (error) {
        resetAuthMethodHints();
        throw error;
      }
      return;
    }

    throw new Error("Passkey sign-in failed. Please try again.");
  }, [
    authCapabilities,
    finalizeAuthenticatedSession,
    resetAuthMethodHints,
    setProviderAuthHints,
    syncPasskeyStepUpAfterAuth,
  ]);

  const registerPasskey = useCallback(async () => {
    if (!authCapabilities.supportsPasskeys) {
      throw new Error(
        authCapabilities.passkeyMessage ?? "Unable to finish passkey setup.",
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
      isAuthenticated: !!user && !!session && !requiresPasskeyStepUp,
      requiresPasskeyStepUp,
      lastAuthMethod,
      signIn,
      signUp,
      signOut,
      signInWithPasskey,
      completePasskeyStepUp,
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
      completePasskeyStepUp,
      registerPasskey,
      deletePasskey,
      consumePendingAuthPassword,
      clearPendingAuthPassword,
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
