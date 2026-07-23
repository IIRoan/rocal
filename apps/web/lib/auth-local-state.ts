import { createLogger } from "@workspace/logger";
import { authClient, signOut } from "@/lib/auth-client";
import { clearAuthPasswords } from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  clearOrphanedEncPasswordCookie,
} from "@/lib/enc-password-cookie";
import { resetE2eeBootstrap } from "@/lib/e2ee-bootstrap";

const log = createLogger("auth-local-state");

export type AuthRecoveryReason = "session-mismatch" | "login-page-reconcile";

/**
 * Remove Solace-specific client artifacts that should never survive sign-out
 * or a fresh unauthenticated visit.
 */
export function clearSolaceClientAuthArtifacts(): void {
  clearAuthPasswords();
  clearEncPasswordCookie();
  resetE2eeBootstrap();
}

/**
 * Drop encryption artifacts left behind when the auth session is gone but a
 * prior device's cookie or key material is still present.
 */
export function clearOrphanedClientAuthArtifacts(): void {
  clearOrphanedEncPasswordCookie();
}

/**
 * Best-effort server sign-out plus a full local auth artifact wipe.
 */
export async function signOutAndClearLocalState(): Promise<void> {
  try {
    await signOut();
  } catch (error) {
    log.warn("Server sign-out failed while clearing local auth state", {
      error,
    });
  }

  clearSolaceClientAuthArtifacts();
}

export type AuthSessionReconciliation =
  | { status: "authenticated" }
  | { status: "unauthenticated" }
  | { status: "recovered" }
  | { status: "unavailable" };

/**
 * Validate Better Auth's cached client session against its durable server-side
 * session. A failed validation never signs out: network failures are not proof
 * that the session is invalid, and a stale local session can be replaced by the
 * next successful sign-in without revoking a newly issued server session.
 */
export async function reconcileAuthSession(input: {
  hasClientSession: boolean;
  reason?: AuthRecoveryReason;
}): Promise<AuthSessionReconciliation> {
  if (!input.hasClientSession) {
    clearOrphanedClientAuthArtifacts();
    return { status: "unauthenticated" };
  }

  try {
    const result = await authClient.getSession({
      query: { disableCookieCache: true },
    });

    if (result?.data?.user) {
      return { status: "authenticated" };
    }

    if (result?.error) {
      log.warn("Session validation failed during reconciliation", {
        reason: input.reason ?? "session-mismatch",
      });
      return { status: "unavailable" };
    }

    log.info("Discarding stale client auth artifacts", {
      reason: input.reason ?? "session-mismatch",
    });
    clearSolaceClientAuthArtifacts();
    return { status: "recovered" };
  } catch {
    log.warn("Session validation was unavailable during reconciliation", {
      reason: input.reason ?? "session-mismatch",
    });
    return { status: "unavailable" };
  }
}
