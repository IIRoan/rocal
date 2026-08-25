"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { reconcileAuthSession } from "@/lib/auth-local-state";
import { accountApiService } from "@/lib/account-api-service";
import {
  isPasskeyStepUpExemptPath,
  redirectToPasskeyStepUpLogin,
} from "@/lib/auth-navigation";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";

type PasskeyGate =
  | { status: "pending" }
  | { status: "ok"; userId: string }
  | { status: "redirecting"; userId: string };

async function reconcileCurrentUserSession(input: {
  isCancelled: () => boolean;
  refetchSession?: (args: {
    query: { disableCookieCache: boolean };
  }) => Promise<unknown>;
}): Promise<"recovered" | "reconciled"> {
  if (input.isCancelled()) {
    return "reconciled";
  }

  const result = await reconcileAuthSession({
    hasClientSession: true,
    reason: "session-mismatch",
  });

  if (input.isCancelled() || result.status !== "recovered") {
    return "reconciled";
  }

  await input.refetchSession?.({
    query: { disableCookieCache: true },
  });
  return "recovered";
}

function isPasskeyGateBlocking(
  shouldHold: boolean,
  userId: string | null,
  gate: PasskeyGate,
): boolean {
  if (!shouldHold || !userId) {
    return false;
  }

  if (gate.status === "pending") {
    return true;
  }

  return gate.userId !== userId || gate.status === "redirecting";
}

/**
 * Keeps Better Auth's client session cache aligned with the server session.
 * Mirrors the native AuthProvider startup reconciliation flow.
 */
export function AuthSessionGuard({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch: refetchSession } = useSession();
  const pathname = usePathname();
  const lastReconciledUserIdRef = useRef<string | null>(null);
  const isRecoveringRef = useRef(false);
  const [passkeyGate, setPasskeyGate] = useState<PasskeyGate>({
    status: "pending",
  });

  const userId = session?.user?.id ?? null;
  const shouldHoldForPasskeyCheck =
    !isPending && Boolean(userId) && !isPasskeyStepUpExemptPath(pathname);

  useEffect(() => {
    if (isPending || isRecoveringRef.current) {
      return;
    }

    if (!userId) {
      lastReconciledUserIdRef.current = null;
      void reconcileAuthSession({ hasClientSession: false });
      return;
    }

    if (lastReconciledUserIdRef.current === userId) {
      return;
    }

    let cancelled = false;
    isRecoveringRef.current = true;

    void reconcileCurrentUserSession({
      isCancelled: () => cancelled,
      refetchSession,
    })
      .then((outcome) => {
        if (cancelled) {
          return;
        }

        lastReconciledUserIdRef.current =
          outcome === "recovered" ? null : userId;
      })
      .finally(() => {
        isRecoveringRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [isPending, refetchSession, userId]);

  useEffect(() => {
    if (!shouldHoldForPasskeyCheck || !userId) {
      return;
    }

    if (passkeyGate.status !== "pending" && passkeyGate.userId === userId) {
      return;
    }

    let cancelled = false;

    void accountApiService
      .getAuthStatus()
      .then((authStatus) => {
        if (cancelled) {
          return;
        }

        const requiresStepUp =
          authStatus.authenticated && authStatus.requiresPasskeyStepUp;
        setPasskeyGate(
          requiresStepUp
            ? { status: "redirecting", userId }
            : { status: "ok", userId },
        );
        if (requiresStepUp) {
          redirectToPasskeyStepUpLogin();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPasskeyGate({ status: "ok", userId });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [passkeyGate, shouldHoldForPasskeyCheck, userId]);

  if (isPasskeyGateBlocking(shouldHoldForPasskeyCheck, userId, passkeyGate)) {
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
