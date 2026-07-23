"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { reconcileAuthSession } from "@/lib/auth-local-state";

async function reconcileAuthenticatedUser(
  userId: string,
  isCancelled: () => boolean,
): Promise<"recovered" | "reconciled"> {
  const result = await reconcileAuthSession({
    hasClientSession: true,
    reason: "session-mismatch",
  });

  if (isCancelled()) {
    return "reconciled";
  }

  return result.status === "recovered" ? "recovered" : "reconciled";
}

/**
 * Keeps Better Auth's client session cache aligned with the server session.
 * Mirrors the native AuthProvider startup reconciliation flow.
 */
export function AuthSessionGuard() {
  const { data: session, isPending, refetch: refetchSession } = useSession();
  const lastReconciledUserIdRef = useRef<string | null>(null);
  const isRecoveringRef = useRef(false);

  useEffect(() => {
    if (isPending || isRecoveringRef.current) {
      return;
    }

    const userId = session?.user?.id ?? null;

    if (!userId) {
      lastReconciledUserIdRef.current = null;
      void reconcileAuthSession({ hasClientSession: false });
      return;
    }

    if (lastReconciledUserIdRef.current === userId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      isRecoveringRef.current = true;
      try {
        const outcome = await reconcileAuthenticatedUser(
          userId,
          () => cancelled,
        );

        if (!cancelled) {
          if (outcome === "recovered") {
            lastReconciledUserIdRef.current = null;
            await refetchSession?.({
              query: { disableCookieCache: true },
            });
          } else {
            lastReconciledUserIdRef.current = userId;
          }
        }
      } finally {
        isRecoveringRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPending, refetchSession, session?.user?.id]);

  return null;
}
