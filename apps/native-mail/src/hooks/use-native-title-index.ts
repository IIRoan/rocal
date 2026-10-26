import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { TitleIndexDocument } from "@workspace/calendar-core";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useMailAccount, useMailRuntime } from "../lib/mail/use-mail";
import {
  readNativeTitleIndex,
  rebuildNativeTitleIndex,
} from "../lib/search/private-title-index";
import {
  isNativeTitleIndexEnabled,
  setNativeTitleIndexEnabled,
  subscribeNativeTitleIndexEnabled,
} from "@workspace/native-core/lib/search/title-index-store";

const REINDEX_INTERVAL_MS = 15 * 60 * 1000;
const BODY_BACKFILL_DELAY_MS = 5 * 1000;

export function useNativeTitleIndex() {
  const { user, isAuthenticated } = useAuth();
  const accountId = user?.id ?? null;
  const accountQuery = useMailAccount();
  const mailProvisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(
    Boolean(isAuthenticated && mailProvisioned),
  );
  const [enabled, setEnabledState] = useState(true);
  const [documents, setDocuments] = useState<TitleIndexDocument[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [pendingBodies, setPendingBodies] = useState(0);
  const [backfillActive, setBackfillActive] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const applyEnabled = (value: boolean) => {
      setEnabledState(value);
      if (!value) setDocuments([]);
    };
    // If the stored preference cannot be read, keep the enabled default.
    void isNativeTitleIndexEnabled()
      .then((value) => {
        if (!cancelled) applyEnabled(value);
      })
      .catch(() => undefined);
    const unsubscribe = subscribeNativeTitleIndexEnabled(applyEnabled);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const refresh = async () => {
    if (!accountId) {
      setDocuments([]);
      return;
    }
    const stored = await readNativeTitleIndex(accountId);
    setDocuments(stored);
  };

  const runtime = runtimeQuery.data;

  const rebuild = async () => {
    // Without an unlocked mailbox there is nothing to index; keep the stored index until there is.
    if (!accountId || !runtime || !enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsIndexing(true);
    try {
      const next = await rebuildNativeTitleIndex({
        accountId,
        runtime,
      });
      setDocuments(next.documents);
      // Only chase the backlog while passes make progress, so a locked vault cannot loop.
      setPendingBodies(next.pendingBodies);
      setBackfillActive(next.pendingBodies > 0 && next.loadedBodies > 0);
    } catch {
      // A failed index read only delays this pass, and the flags below must reset either way.
      await refresh().catch(() => undefined);
    }
    inFlightRef.current = false;
    setIsIndexing(false);
  };

  const setEnabled = async (value: boolean) => {
    setEnabledState(value);
    await setNativeTitleIndexEnabled(value);
    if (!value) {
      setDocuments([]);
      return;
    }
    await rebuild();
  };

  const refreshIndex = useEffectEvent(() => refresh());
  const rebuildIndex = useEffectEvent(() => rebuild());

  // A newly unlocked mailbox (runtime) starts a pass right away instead of at the next interval.
  useEffect(() => {
    if (!accountId || !enabled) return;

    let cancelled = false;
    // A failed index read only delays this pass; the interval retries.
    const syncIndex = async () => {
      await refreshIndex();
      if (!cancelled) await rebuildIndex();
    };
    void syncIndex().catch(() => undefined);

    const interval = setInterval(() => {
      void rebuildIndex().catch(() => undefined);
    }, REINDEX_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accountId, enabled, runtime]);

  useEffect(() => {
    if (!backfillActive || isIndexing || !enabled) return;
    const timeout = setTimeout(
      () => void rebuildIndex().catch(() => undefined),
      BODY_BACKFILL_DELAY_MS,
    );
    return () => clearTimeout(timeout);
  }, [backfillActive, enabled, isIndexing]);

  return {
    documents,
    isIndexing,
    pendingBodies,
    enabled,
    setEnabled,
    rebuild,
  };
}
