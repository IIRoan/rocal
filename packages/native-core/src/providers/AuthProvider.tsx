import React, {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import {
  AUTH_SESSION_LIFETIME_SECONDS,
  AUTH_SESSION_REFRESH_INTERVAL_SECONDS,
} from "@workspace/calendar-core";
import { authClient } from "../lib/auth-client";
import { getAuthCapabilities } from "../lib/auth-capabilities";
import { API_BASE_URL } from "../lib/constants";
import { calendarApiService, getAuthHeaders } from "../lib/api";
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
import {
  ensureSessionTokenCookie,
  healAuthCookieJar,
  rememberSessionTokenFromJar,
  persistRenewedSessionCookie,
  waitForSessionCookie,
} from "../lib/session-cookie";
import {
  getFallbackSessionToken,
  setFallbackSessionToken,
} from "../lib/session-token-fallback";
import { registerClearSession } from "../lib/session-clear";
import { registerPasskeyStepUpRequired } from "../lib/passkey-step-up-required";
import { unregisterNativePushDevice } from "../lib/push-notifications";
import { clearNotificationExtensionSecrets } from "../lib/notification-extension-store";
import {
  clearRecoverableStoredDevice,
  recoverableStoredDeviceId,
} from "../lib/native-e2ee-provider";
import { clearNativeTitleIndex } from "../lib/search/title-index-store";
import { queryClient } from "./QueryProvider";

const AUTH_STATUS_TIMEOUT_MS = 3_000;
const AUTH_STATUS_RETRY_DELAYS_MS = [0, 150, 400] as const;

type AuthStatusPayload = {
  authenticated: boolean;
  hasPasskeys: boolean;
  requiresPasskeyStepUp: boolean;
};

/** Guards the auth-status payload before it flips sign-in state. */
function isAuthStatusPayload(value: unknown): value is AuthStatusPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.authenticated === "boolean" &&
    typeof record.hasPasskeys === "boolean" &&
    typeof record.requiresPasskeyStepUp === "boolean"
  );
}

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

interface AuthState {
  user: User | null;
  session: Session | null;
  requiresPasskeyStepUp: boolean;
  lastAuthMethod: AuthMethod;
}

type AuthAction =
  | { type: "loaded"; user: User; session: Session }
  | { type: "cleared" }
  | { type: "method"; method: AuthMethod }
  | { type: "hints-reset" }
  | { type: "step-up"; required: boolean };

const SIGNED_OUT: AuthState = {
  user: null,
  session: null,
  requiresPasskeyStepUp: false,
  lastAuthMethod: "unknown",
};

/** Renewals return a new user object; keeping the old one stops effects keyed on it from restarting startup. */
function isSameUser(current: User | null, next: User): current is User {
  return (
    current?.id === next.id &&
    current.name === next.name &&
    current.email === next.email &&
    (current.image ?? null) === (next.image ?? null)
  );
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "loaded":
      return {
        ...state,
        user: isSameUser(state.user, action.user) ? state.user : action.user,
        session: action.session,
      };
    case "cleared":
      return SIGNED_OUT;
    case "method":
      return { ...state, lastAuthMethod: action.method };
    case "hints-reset":
      return { ...state, lastAuthMethod: "unknown", requiresPasskeyStepUp: false };
    case "step-up":
      return { ...state, requiresPasskeyStepUp: action.required };
  }
}

/** App-specific hooks into the shared auth flow; both apps run the same sign-in code. */
export interface AuthLifecycle {
  /** Wipes app data when the session ends: before clearing on sign-out, and after clearing when the server ended it. */
  onSignedOut?: () => Promise<void>;
}
type SignInResult = { requiresPasskeyStepUp: boolean };

/** A device row is useless once sign-out deletes its key, and deleting it needs the session sign-out ends. */
async function deleteRecoverableDeviceRow(headers: Record<string, string>): Promise<void> {
  const deviceId = await recoverableStoredDeviceId();
  if (deviceId) {
    await calendarApiService.deleteE2eeDevice(deviceId, headers);
  }
}

/** The device key opens the account key and the search index holds decrypted text, so both go with the session in both apps. */
async function wipeSessionData(lifecycle: AuthLifecycle | undefined): Promise<void> {
  await Promise.all([
    clearRecoverableStoredDevice().catch(() => undefined),
    clearNativeTitleIndex().catch(() => undefined),
    lifecycle?.onSignedOut?.(),
  ]);
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
  /** True when the user must complete a registered passkey challenge. */
  requiresPasskeyStepUp: boolean;
  /** The auth method used for the current session when known. */
  lastAuthMethod: AuthMethod;
  /** Sign in with email and password. */
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** Create a new account. */
  signUp: (name: string, email: string, password: string) => Promise<void>;
  /** Sign out and clear the session; a notice is shown on the sign-in screen until the next sign-in. */
  signOut: (notice?: string) => Promise<void>;
  /** Why the last session ended, when the app ended it. */
  signInNotice: string | null;
  /** Authenticate using platform biometrics (passkey). */
  signInWithPasskey: () => Promise<void>;
  /** Verify a registered passkey after email/password sign-in. */
  completePasskeyStepUp: () => Promise<void>;
  /** Register a passkey for the current account. */
  registerPasskey: () => Promise<void>;
  /** Delete a passkey from the current account. */
  deletePasskey: (id: string) => Promise<void>;
  /** Read the pending email/password sign-in password without clearing it. */
  peekPendingAuthPassword: () => string | null;
  /** Retrieve and clear the pending email/password sign-in password. */
  consumePendingAuthPassword: () => string | null;
  /** Clear any pending email/password sign-in password. */
  clearPendingAuthPassword: () => void;
  /** Re-read the signed-in user from the server, bypassing the session cookie cache. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  lifecycle,
}: {
  children: React.ReactNode;
  lifecycle?: AuthLifecycle;
}): React.ReactNode {
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const [
    { user, session, requiresPasskeyStepUp, lastAuthMethod },
    dispatch,
  ] = useReducer(authReducer, SIGNED_OUT);
  const [isLoading, setIsLoading] = useState(true);
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const pendingAuthPasswordRef = useRef<string | null>(null);
  const sessionLoadIdRef = useRef(0);
  const hasLiveSessionRef = useRef(false);
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

  const fetchAuthStatus = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      AUTH_STATUS_TIMEOUT_MS,
    );
    let response: Response;
    const requestHeaders = new Headers(getAuthHeaders());

    try {
      // repo-rules-allow client-api-boundary: auth-status ping kept off the shared HttpClient so a 401 during the post-sign-in cookie race cannot fire onAuthError session clearing.
      response = await fetch(`${API_BASE_URL}/api/account/auth-status`, {
        credentials: "omit",
        headers: requestHeaders,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    await persistRenewedSessionCookie(response.headers, requestHeaders);
    const payload: unknown = response.ok ? await response.json() : null;
    if (!isAuthStatusPayload(payload)) {
      throw new Error("Unable to load authentication status.");
    }
    return payload;
  }, []);

  const applySessionData = useCallback(
    (data: unknown) => {
      const typedData = data as
          | {
            user?: User;
            session?: Session;
            token?: string;
          }
        | undefined;

      if (!typedData?.user) return false;

      const token =
        typedData.session?.token?.trim() || typedData.token?.trim() || "";
      if (token && !getFallbackSessionToken()) {
        setFallbackSessionToken(token);
      }

      if (typedData.session) {
        hasLiveSessionRef.current = true;
        dispatch({
          type: "loaded",
          user: typedData.user,
          session: typedData.session,
        });
        return true;
      }

      if (!token) return false;

      hasLiveSessionRef.current = true;
      dispatch({
        type: "loaded",
        user: typedData.user,
        session: {
          token,
          userId: typedData.user.id,
          expiresAt: new Date(
            Date.now() + AUTH_SESSION_LIFETIME_SECONDS * 1000,
          ),
        },
      });
      return true;
    },
    [],
  );

  const clearPendingAuthPassword = useCallback(() => {
    pendingAuthPasswordRef.current = null;
  }, []);

  const peekPendingAuthPassword = useCallback(() => {
    return pendingAuthPasswordRef.current;
  }, []);

  const consumePendingAuthPassword = useCallback(() => {
    const pendingPassword = pendingAuthPasswordRef.current;
    pendingAuthPasswordRef.current = null;
    return pendingPassword;
  }, []);

  const resetAuthMethodHints = useCallback(() => {
    pendingAuthPasswordRef.current = null;
    dispatch({ type: "hints-reset" });
  }, []);

  const setEmailPasswordAuthHints = useCallback((password: string) => {
    pendingAuthPasswordRef.current = password;
    dispatch({ type: "method", method: "email-password" });
  }, []);

  const setProviderAuthHints = useCallback((method: "passkey") => {
    pendingAuthPasswordRef.current = null;
    dispatch({ type: "method", method });
  }, []);

  const finalizeAuthenticatedSession = useCallback(
    async (data: unknown, errorPrefix: string) => {
      const authToken =
        typeof (data as { token?: unknown } | undefined)?.token === "string"
          ? (data as { token: string }).token
          : null;

      // Persist the cookie before flipping React auth state — otherwise E2EE bootstrap fires API calls without a Cookie header and 401 clears us.
      if (authToken) {
        await ensureSessionTokenCookie(authToken, {
          preferSecure: API_BASE_URL.startsWith("https://"),
        });
      }

      if (applySessionData(data)) {
        return;
      }

      await waitForSessionCookie();
      const sessionResult = await authClient.getSession({
        query: { disableCookieCache: true },
      });
      if (applySessionData(sessionResult?.data)) return;

      if (authToken) {
        await ensureSessionTokenCookie(authToken, {
          preferSecure: API_BASE_URL.startsWith("https://"),
        });
        const recovered = await authClient.getSession({
          query: { disableCookieCache: true },
        });
        if (applySessionData(recovered?.data)) return;
      }

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
      dispatch({ type: "step-up", required: requiresStepUp });
      return requiresStepUp;
    } catch {
      // Password/passkey authentication already succeeded. The status request is only a follow-up for step-up UI and must not undo the new session.
      dispatch({ type: "step-up", required: false });
      return false;
    }
  }, [fetchAuthStatus]);

  const waitForPasskeyStepUpToClear = useCallback(async () => {
    for (const delayMs of AUTH_STATUS_RETRY_DELAYS_MS) {
      if (delayMs > 0) {
        // oxlint-disable-next-line react-doctor/async-await-in-loop -- each retry waits for the previous status, with backoff.
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const authStatus = await fetchAuthStatus();
        const requiresStepUp =
          authStatus.authenticated && authStatus.requiresPasskeyStepUp;
        if (!requiresStepUp) {
          dispatch({ type: "step-up", required: false });
          return;
        }
      } catch {
        // Retry while cookie persistence catches up.
      }
    }

    dispatch({ type: "step-up", required: false });
  }, [fetchAuthStatus]);

  const clearSession = useCallback(() => {
    sessionLoadIdRef.current += 1;
    hasLiveSessionRef.current = false;
    setFallbackSessionToken(null);
    pendingAuthPasswordRef.current = null;
    dispatch({ type: "cleared" });
    // The cache holds decrypted events, mail and the search corpus, so none of it outlives the session.
    queryClient.clear();
  }, []);

  // A session the server ended (revoked, expired, 401/403) gets the sign-out wipe; a network failure keeps the device's data.
  const endSession = useCallback(() => {
    clearSession();
    void wipeSessionData(lifecycleRef.current).catch(() => undefined);
  }, [clearSession]);

  // Register the end-session callback so the HTTP layer can terminate sessions on 401/403 without a React hook.
  useEffect(() => {
    registerClearSession(endSession);
    return () => {
      registerClearSession(() => {});
    };
  }, [endSession]);

  useEffect(() => {
    registerPasskeyStepUpRequired(() => {
      dispatch({ type: "step-up", required: true });
    });
    return () => {
      registerPasskeyStepUpRequired(() => {});
    };
  }, []);

  const completePasskeyStepUp = useCallback(async () => {
    sessionLoadIdRef.current += 1;
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

      await waitForPasskeyStepUpToClear();
      return;
    }

    if (authCapabilities.passkeyMode === "browser-bridge") {
      await signInWithBrowserPasskey(authClient);
      await waitForPasskeyStepUpToClear();
      return;
    }

    throw new Error("Passkey verification failed. Please try again.");
  }, [authCapabilities, waitForPasskeyStepUpToClear]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setSignInNotice(null);
      setEmailPasswordAuthHints(password);
      sessionLoadIdRef.current += 1;
      let authData: unknown;
      try {
        await healAuthCookieJar();
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
          resetAuthMethodHints();
          throw error;
        }

        authData = recoveredSession.data;
      }

      const earlyToken =
        typeof (authData as { token?: unknown } | undefined)?.token === "string"
          ? (authData as { token: string }).token
          : typeof (authData as { session?: { token?: unknown } } | undefined)
                ?.session?.token === "string"
            ? (authData as { session: { token: string } }).session.token
            : null;

      await waitForSessionCookie();
      const fromJar = await rememberSessionTokenFromJar();
      if (!fromJar && earlyToken) {
        await ensureSessionTokenCookie(earlyToken, {
          preferSecure: API_BASE_URL.startsWith("https://"),
        });
      }
      const requiresStepUp = await syncPasskeyStepUpAfterAuth();
      if (requiresStepUp) {
        if (!authCapabilities.supportsPasskeys) {
          await finalizeAuthenticatedSession(authData, "Sign-in");
          return { requiresPasskeyStepUp: true };
        }

        await completePasskeyStepUp();
      }

      await finalizeAuthenticatedSession(authData, "Sign-in");
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
      setSignInNotice(null);
      sessionLoadIdRef.current += 1;
      setEmailPasswordAuthHints(password);
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        resetAuthMethodHints();
        throw new Error(
          result.error.message ?? "Sign-up failed. Please try again.",
        );
      }

      try {
        await finalizeAuthenticatedSession(result.data, "Sign-up");
        dispatch({ type: "step-up", required: false });
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

  const signOut = useCallback(async (notice?: string) => {
    sessionLoadIdRef.current += 1;
    hasLiveSessionRef.current = false;
    // Capture before clearing the fallback so logout requests still authenticate when the jar is empty.
    const logoutHeaders = getAuthHeaders();
    setFallbackSessionToken(null);
    const leave = async () => {
      await Promise.all([
        unregisterNativePushDevice(logoutHeaders),
        deleteRecoverableDeviceRow(logoutHeaders).catch(() => undefined),
        clearNotificationExtensionSecrets(),
      ]);
      await authClient
        .signOut(
          logoutHeaders.cookie
            ? { fetchOptions: { headers: { cookie: logoutHeaders.cookie } } }
            : undefined,
        )
        // Best-effort — local state is cleared regardless.
        .catch(() => undefined);
      await wipeSessionData(lifecycleRef.current);
    };
    // A failing cleanup step still ends the session, so the app is never left signed in without its keys.
    await leave().finally(() => {
      clearSession();
      setSignInNotice(notice ?? null);
    });
  }, [clearSession]);

  useEffect(() => {
    let ignore = false;
    const loadId = ++sessionLoadIdRef.current;
    const isStale = () => ignore || loadId !== sessionLoadIdRef.current;

    async function loadSession() {
      try {
        // Legacy jars used a bare `"1"` chunk meta; Better Auth JSON.parses that to number 1 and crashes on Set-Cookie. Flatten before any auth I/O.
        await healAuthCookieJar();
        if (isStale()) return;

        const result = await authClient.getSession({
          query: { disableCookieCache: true },
        });
        if (isStale()) return;

        if (applySessionData(result?.data)) {
          try {
            const authStatus = await fetchAuthStatus();
            if (isStale()) return;
            if (authStatus.authenticated) {
              dispatch({
                type: "step-up",
                required: authStatus.requiresPasskeyStepUp,
              });
            }
          } catch {
            // Keep a session that Better Auth just validated.
          }
        } else if (!isStale() && !hasLiveSessionRef.current) {
          if (result?.error) clearSession();
          else endSession();
        }
      } catch {
        if (!isStale() && !hasLiveSessionRef.current) {
          clearSession();
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void loadSession();
    return () => {
      ignore = true;
    };
  }, [applySessionData, clearSession, endSession, fetchAuthStatus]);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || isLoading) return;
    let cancelled = false;
    let inflight = false;
    async function refresh() {
      if (
        inflight || cancelled || !hasLiveSessionRef.current ||
        AppState.currentState !== "active"
      ) return;
      inflight = true;
      const loadId = sessionLoadIdRef.current;
      try {
        const result = await authClient.getSession({
          query: { disableCookieCache: true },
          fetchOptions: {
            onSuccess() {
              if (
                cancelled || loadId !== sessionLoadIdRef.current ||
                !hasLiveSessionRef.current
              ) {
                throw new Error("Session changed while renewing.");
              }
            },
          },
        });
        if (cancelled || loadId !== sessionLoadIdRef.current || result?.error) return;
        if (result?.data?.user.id === userId) applySessionData(result.data);
        else if (!result?.data) endSession();
      } catch {
        // A network failure does not invalidate the existing session.
      } finally {
        inflight = false;
      }
    }
    const timer = setInterval(() => {
      void refresh();
    }, AUTH_SESSION_REFRESH_INTERVAL_SECONDS * 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [userId, isLoading, applySessionData, endSession]);

  const signInWithPasskey = useCallback(async () => {
    sessionLoadIdRef.current += 1;
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

  const refreshUser = useCallback(async () => {
    const result = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    applySessionData(result?.data);
  }, [applySessionData]);

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
      signInNotice,
      signInWithPasskey,
      completePasskeyStepUp,
      registerPasskey,
      deletePasskey,
      consumePendingAuthPassword,
      peekPendingAuthPassword,
      clearPendingAuthPassword,
      refreshUser,
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
      signInNotice,
      signInWithPasskey,
      completePasskeyStepUp,
      registerPasskey,
      deletePasskey,
      consumePendingAuthPassword,
      peekPendingAuthPassword,
      clearPendingAuthPassword,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
