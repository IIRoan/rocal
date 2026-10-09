"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createLogger } from "@workspace/logger";
import { useSession } from "@/lib/auth-client";
import { reconcileAuthSession } from "@/lib/auth-local-state";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { LOGIN_PATH } from "@/lib/app-routes";
import {
  isPasskeyStepUpExemptPath,
  redirectToPasskeyStepUpLogin,
} from "@/lib/auth-navigation";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";

const log = createLogger("auth-session-guard");

/** Keeps Better Auth's client session cache aligned with the server session, mirroring the native AuthProvider startup flow. */
export function AuthSessionGuard({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch: refetchSession } = useSession();
  const pathname = usePathname();
  const recoveryRef = useRef<{
    userId: string;
    sessionId: string | null;
    promise: ReturnType<typeof reconcileAuthSession>;
  } | null>(null);

  const userId = session?.user?.id ?? null;
  const sessionId = session?.session?.id ?? null;
  const isLoginPath =
    pathname === LOGIN_PATH || Boolean(pathname?.startsWith(`${LOGIN_PATH}/`));
  const shouldHoldForPasskeyCheck =
    !isPending && Boolean(userId) && !isPasskeyStepUpExemptPath(pathname);
  const authStatus = useAuthStatus(
    userId,
    sessionId,
    shouldHoldForPasskeyCheck,
  );
  const needsRecovery =
    !shouldHoldForPasskeyCheck ||
    authStatus.isError ||
    authStatus.data?.authenticated === false;
  const requiresStepUp = Boolean(
    authStatus.data?.authenticated && authStatus.data.requiresPasskeyStepUp,
  );

  useEffect(() => {
    if (isPending || isLoginPath) {
      return;
    }

    if (!userId) {
      recoveryRef.current = null;
      void reconcileAuthSession({ hasClientSession: false }).catch((error) => {
        log.warn("Auth artifact cleanup failed during session guard", {
          error,
        });
      });
      return;
    }

    if (!needsRecovery) return;

    let cancelled = false;
    if (
      recoveryRef.current?.userId !== userId ||
      recoveryRef.current.sessionId !== sessionId
    ) {
      recoveryRef.current = {
        userId,
        sessionId,
        promise: reconcileAuthSession({
          hasClientSession: true,
          reason: "session-mismatch",
        }),
      };
    }
    void recoveryRef.current.promise
      .then(async (result) => {
        if (cancelled || result.status !== "recovered") return;
        await refetchSession?.({ query: { disableCookieCache: true } });
      })
      .catch((error) => {
        log.warn("Session reconciliation failed", { error });
      });

    return () => {
      cancelled = true;
    };
  }, [
    isPending,
    isLoginPath,
    needsRecovery,
    refetchSession,
    userId,
    sessionId,
  ]);

  useEffect(() => {
    if (shouldHoldForPasskeyCheck && requiresStepUp)
      redirectToPasskeyStepUpLogin();
  }, [shouldHoldForPasskeyCheck, requiresStepUp]);

  if (shouldHoldForPasskeyCheck && (authStatus.isPending || requiresStepUp)) {
    return (
      <PageLoadingOverlay
        isLoading={true}
        messageContext="AUTH_FLOW"
        enableCycling={true}
        priority
      />
    );
  }

  return children;
}
