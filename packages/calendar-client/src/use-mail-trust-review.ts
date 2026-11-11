import { useEffect, useRef, useState } from "react";
import type {
  createMailTrustReviewBridge,
  MailTrustProblem,
  MailTrustReviewAction,
} from "@workspace/calendar-core";

type PendingReview = {
  id: number;
  problem: MailTrustProblem;
  resolve: (action: MailTrustReviewAction) => void;
};

export function useMailTrustReview(
  bridge: ReturnType<typeof createMailTrustReviewBridge>,
  accountId: string | null,
) {
  const [pending, setPending] = useState<PendingReview | null>(null);
  const sequence = useRef(0);
  const pendingRef = useRef<PendingReview | null>(null);
  useEffect(() => {
    setPending(null);
    const unsubscribe = bridge.subscribe((problem) => {
      pendingRef.current?.resolve("cancel");
      pendingRef.current = null;
      if (!problem || !accountId) {
        setPending(null);
        return Promise.resolve("cancel");
      }
      return new Promise<MailTrustReviewAction>((resolve) => {
        const next = { id: ++sequence.current, problem, resolve };
        pendingRef.current = next;
        setPending(next);
      });
    });
    return () => {
      unsubscribe();
      pendingRef.current?.resolve("cancel");
      pendingRef.current = null;
    };
  }, [accountId, bridge]);
  const settle = (action: MailTrustReviewAction) => {
    const current = pendingRef.current;
    if (!current || current.id !== pending?.id) return;
    current.resolve(action);
    pendingRef.current = null;
    setPending(null);
  };
  return {
    problem: pending?.problem ?? null,
    reviewId: pending?.id ?? 0,
    settle,
  };
}
