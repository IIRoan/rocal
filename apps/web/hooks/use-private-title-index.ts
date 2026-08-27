"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TitleIndexDocument } from "@workspace/calendar-core";
import { useSession } from "@/lib/auth-client";
import { PRIVATE_SEARCH_INDEX_CHANGE_EVENT } from "@/hooks/use-private-search-index-controls";
import {
  loadPrivateTitleIndex,
  rebuildPrivateTitleIndex,
} from "@/lib/search/private-title-index";

const ENABLED_KEY = "search:private-content-index-enabled";
const PAUSED_KEY = "search:private-content-index-paused";
const REINDEX_INTERVAL_MS = 15 * 60 * 1000;

function readIndexFlags() {
  if (typeof window === "undefined") {
    return { enabled: false, paused: false };
  }
  return {
    enabled: window.localStorage.getItem(ENABLED_KEY) === "true",
    paused: window.localStorage.getItem(PAUSED_KEY) === "true",
  };
}

export function usePrivateTitleIndex() {
  const { data: session } = useSession();
  const accountId = session?.user?.id ?? null;
  const [flags, setFlags] = useState(readIndexFlags);
  const [documents, setDocuments] = useState<TitleIndexDocument[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexedAt, setIndexedAt] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const canIndex = Boolean(accountId) && flags.enabled && !flags.paused;

  useEffect(() => {
    const syncFlags = () => setFlags(readIndexFlags());
    window.addEventListener(PRIVATE_SEARCH_INDEX_CHANGE_EVENT, syncFlags);
    window.addEventListener("storage", syncFlags);
    return () => {
      window.removeEventListener(PRIVATE_SEARCH_INDEX_CHANGE_EVENT, syncFlags);
      window.removeEventListener("storage", syncFlags);
    };
  }, []);

  const refreshFromStore = useCallback(async () => {
    if (!accountId) {
      setDocuments([]);
      setIndexedAt(null);
      return;
    }
    const snapshot = await loadPrivateTitleIndex(accountId);
    setDocuments(snapshot.documents);
    setIndexedAt(snapshot.indexedAt);
  }, [accountId]);

  const rebuild = useCallback(async () => {
    if (!accountId || !canIndex || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsIndexing(true);
    try {
      const snapshot = await rebuildPrivateTitleIndex({ accountId });
      setDocuments(snapshot.documents);
      setIndexedAt(snapshot.indexedAt);
    } catch {
      await refreshFromStore();
    } finally {
      inFlightRef.current = false;
      setIsIndexing(false);
    }
  }, [accountId, canIndex, refreshFromStore]);

  useEffect(() => {
    if (!accountId) {
      setDocuments([]);
      setIndexedAt(null);
      return;
    }

    if (!flags.enabled) {
      setDocuments([]);
      setIndexedAt(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      await refreshFromStore();
      if (!cancelled && canIndex) await rebuild();
    })();

    if (!canIndex) return undefined;

    const interval = window.setInterval(() => {
      void rebuild();
    }, REINDEX_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountId, canIndex, flags.enabled, rebuild, refreshFromStore]);

  return {
    documents,
    isIndexing,
    indexedAt,
    enabled: canIndex,
    rebuild,
  };
}
