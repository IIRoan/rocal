import { createLogger } from "@workspace/logger";
import { signOut } from "@/lib/auth-client";
import { accountApiService } from "@/lib/account-api-service";
import { clearAuthPasswords } from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  clearOrphanedEncPasswordCookie,
} from "@/lib/enc-password-cookie";
import { resetE2eeBootstrap } from "@/lib/e2ee-bootstrap";

const log = createLogger("auth-local-state");

export type AuthRecoveryReason =
  | "session-mismatch"
  | "auth-status-unavailable"
  | "post-sign-in-unsettled"
  | "login-page-reconcile";

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

/**
 * Recover from stale Better Auth cookies or mismatched encryption artifacts.
 */
export async function recoverFromStaleAuthState(
  reason: AuthRecoveryReason,
): Promise<void> {
  log.info("Recovering from stale client auth state", { reason });
  await signOutAndClearLocalState();
}

export type AuthSessionReconciliation =
  | { status: "authenticated" }
  | { status: "unauthenticated" }
  | { status: "recovered" };

/**
 * Compare the Better Auth client session with the server auth-status endpoint
 * and self-heal when they disagree.
 */
export async function reconcileAuthSession(input: {
  hasClientSession: boolean;
  reason?: AuthRecoveryReason;
}): Promise<AuthSessionReconciliation> {
  if (!input.hasClientSession) {
    clearOrphanedClientAuthArtifacts();
    return { status: "unauthenticated" };
  }

  const retryDelaysMs = [0, 100, 250, 500] as const;

  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }

    try {
      const authStatus = await accountApiService.getAuthStatus();

      if (authStatus.authenticated) {
        return { status: "authenticated" };
      }
    } catch (error) {
      log.warn("Auth status check failed during session reconciliation", {
        error,
      });
    }
  }

  await recoverFromStaleAuthState(input.reason ?? "session-mismatch");
  return { status: "recovered" };
}
