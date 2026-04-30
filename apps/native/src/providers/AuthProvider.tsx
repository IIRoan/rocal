import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authClient } from "../lib/auth-client";

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
  /** Sign out and clear the session. */
  signOut: () => Promise<void>;
  /** Authenticate using platform biometrics (passkey). */
  signInWithPasskey: () => Promise<void>;
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

      if (result.data) {
        setUser(result.data.user as User);
        setSession((result.data as any).session as Session);
      }
    },
    [],
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

      if (result.data) {
        setUser(result.data.user as User);
        setSession((result.data as any).session as Session);
      }
    },
    [],
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
    const result = await (authClient as any).signIn.passkey();

    if (result.error) {
      throw new Error(
        result.error.message ?? "Passkey sign-in failed. Please try again.",
      );
    }

    if (result.data) {
      setUser(result.data.user as User);
      setSession(result.data.session as Session);
    }
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
      signOut,
      signInWithPasskey,
    }),
    [user, session, isLoading, signIn, signUp, signOut, signInWithPasskey],
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
