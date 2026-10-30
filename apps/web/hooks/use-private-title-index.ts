"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { TitleIndexDocument } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { PRIVATE_CONTENT_INDEX_ENABLED_KEY } from "@/lib/search/private-index-flags";
import { useSession } from "@/lib/auth-client";
import { PRIVATE_SEARCH_INDEX_CHANGE_EVENT } from "@/hooks/use-private-search-index-controls";
import {
  getActiveE2eeSession,
  subscribeActiveE2eeSession,
} from "@/lib/e2ee-session";
import {
  loadPrivateTitleIndex,
  rebuildPrivateTitleIndex,
} from "@/lib/search/private-title-index";

const ENABLED_KEY = PRIVATE_CONTENT_INDEX_ENABLED_KEY;
const PAUSED_KEY = "search:private-content-index-paused";
const log = createLogger("private-title-index");
const REINDEX_INTERVAL_MS = 15 * 60 * 1000;
const BODY_BACKFILL_DELAY_MS = 5 * 1000;
const getServerEncryptionSession = () => null;

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
  const encryptionSession = useSyncExternalStore(
    subscribeActiveE2eeSession,
    getActiveE2eeSession,
    getServerEncryptionSession,
  );
  const [flags, setFlags] = useState(readIndexFlags);
  const [documents, setDocuments] = useState<TitleIndexDocument[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexedAt, setIndexedAt] = useState<string | null>(null);
  const [pendingBodies, setPendingBodies] = useState(0);
  const inFlightRef = useRef(false);

  const canIndex =
    Boolean(accountId) &&
    flags.enabled &&
    !flags.paused &&
    encryptionSession?.userId === accountId;

  useEffect(() => {
    const syncFlags = () => setFlags(readIndexFlags());
    window.addEventListener(PRIVATE_SEARCH_INDEX_CHANGE_EVENT, syncFlags);
    window.addEventListener("storage", syncFlags);
    return () => {
      window.removeEventListener(PRIVATE_SEARCH_INDEX_CHANGE_EVENT, syncFlags);
      window.removeEventListener("storage", syncFlags);
    };
  }, []);

  const refreshFromStore = async () => {
    if (!accountId) {
      setDocuments([]);
      setIndexedAt(null);
      return;
    }
    const snapshot = await loadPrivateTitleIndex(accountId);
    setDocuments(snapshot.documents);
    setIndexedAt(snapshot.indexedAt);
  };

  const rebuild = async () => {
    if (!accountId || !canIndex || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsIndexing(true);
    const indexTitles = async () => {
      const snapshot = await rebuildPrivateTitleIndex({ accountId });
      setDocuments(snapshot.documents);
      setIndexedAt(snapshot.indexedAt);
      // Only chase the backlog while passes make progress, so a locked vault cannot loop.
      setPendingBodies(snapshot.loadedBodies > 0 ? snapshot.pendingBodies : 0);
    };
    await indexTitles().catch(async () => {
      // A failed index read only delays this pass, and the flags below must reset either way.
      await refreshFromStore().catch(() => undefined);
    });
    inFlightRef.current = false;
    setIsIndexing(false);
  };

  const refreshIndex = useEffectEvent(() => refreshFromStore());
  const rebuildIndex = useEffectEvent(() => rebuild());

  useEffect(() => {
    if (!accountId || !flags.enabled) {
      return;
    }

    let cancelled = false;
    void (async () => {
      await refreshIndex();
      if (!cancelled && canIndex) await rebuildIndex();
    })().catch((error) => {
      log.warn("Failed to refresh the private title index", error);
    });

    if (!canIndex) return undefined;

    const interval = window.setInterval(() => {
      void rebuildIndex().catch((error) => {
        log.warn("Failed to rebuild the private title index", error);
      });
    }, REINDEX_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accountId, canIndex, flags.enabled]);

  useEffect(() => {
    if (pendingBodies <= 0 || isIndexing || !canIndex) return;
    const timeout = window.setTimeout(() => {
      void rebuildIndex().catch((error) => {
        log.warn("Failed to rebuild the private title index", error);
      });
    }, BODY_BACKFILL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [canIndex, isIndexing, pendingBodies]);

  const indexActive = Boolean(accountId) && flags.enabled;

  return {
    documents: indexActive ? documents : [],
    isIndexing,
    indexedAt: indexActive ? indexedAt : null,
    enabled: canIndex,
    rebuild,
  };
}
