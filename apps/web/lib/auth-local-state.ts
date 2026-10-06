import { createLogger } from "@workspace/logger";
import { authClient, signOut } from "@/lib/auth-client";
import { clearAuthPasswords } from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  clearOrphanedEncPasswordCookie,
} from "@/lib/enc-password-cookie";
import { resetE2eeBootstrap } from "@/lib/e2ee-bootstrap";
import { clearLocalMailSettings } from "@/lib/mail/mail-settings-storage";

const log = createLogger("auth-local-state");

export type AuthRecoveryReason = "session-mismatch" | "login-page-reconcile";

/** Remove client artifacts that must never survive sign-out or an unauthenticated visit. */
export function clearSolaceClientAuthArtifacts(): void {
  clearAuthPasswords();
  clearEncPasswordCookie();
  resetE2eeBootstrap();
  clearLocalMailSettings();
}

/** Drop encryption artifacts left when the session is gone but a prior device's key material remains. */
export function clearOrphanedClientAuthArtifacts(): void {
  clearOrphanedEncPasswordCookie();
  clearLocalMailSettings();
}

/** Best-effort server sign-out plus a full local auth artifact wipe. */
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

/** Server-side session check; failures never sign out because a network error is not proof the session is invalid. */
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
