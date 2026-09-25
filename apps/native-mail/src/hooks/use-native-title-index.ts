import { useCallback, useEffect, useRef, useState } from "react";
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
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void isNativeTitleIndexEnabled().then((value) => {
      if (!cancelled) setEnabledState(value);
    });
    const unsubscribe = subscribeNativeTitleIndexEnabled((value) => {
      setEnabledState(value);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!accountId) {
      setDocuments([]);
      return;
    }
    const stored = await readNativeTitleIndex(accountId);
    setDocuments(stored);
  }, [accountId]);

  const runtime = runtimeQuery.data;

  const rebuild = useCallback(async () => {
    // Without an unlocked mailbox there is nothing to index; keep the stored index until there is.
    if (!accountId || !runtime || !enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsIndexing(true);
    try {
      const next = await rebuildNativeTitleIndex({
        accountId,
        runtime,
      });
      setDocuments(next);
    } catch {
      await refresh();
    } finally {
      inFlightRef.current = false;
      setIsIndexing(false);
    }
  }, [accountId, enabled, refresh, runtime]);

  const setEnabled = useCallback(
    async (value: boolean) => {
      setEnabledState(value);
      await setNativeTitleIndexEnabled(value);
      if (!value) {
        setDocuments([]);
        return;
      }
      await rebuild();
    },
    [rebuild],
  );

  useEffect(() => {
    if (!accountId || !enabled) {
      if (!enabled) setDocuments([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) await rebuild();
    })();

    const interval = setInterval(() => {
      void rebuild();
    }, REINDEX_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accountId, enabled, rebuild, refresh]);

  return {
    documents,
    isIndexing,
    enabled,
    setEnabled,
    rebuild,
  };
}
