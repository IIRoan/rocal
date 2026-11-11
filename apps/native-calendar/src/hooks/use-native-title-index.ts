import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { TitleIndexDocument } from "@workspace/calendar-core";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import {
  getSessionDataScope,
  subscribeSessionDataScope,
  isSessionDataScopeCurrent,
  type SessionDataScope,
} from "@workspace/native-core/lib/session-data-lifecycle";
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
  const { user } = useAuth();
  const accountId = user?.id ?? null;
  const scope = useSyncExternalStore(
    subscribeSessionDataScope,
    getSessionDataScope,
    getSessionDataScope,
  );
  const [enabled, setEnabledState] = useState(true);
  const [snapshot, setSnapshot] = useState<{
    scope: SessionDataScope | null;
    documents: TitleIndexDocument[];
    pendingBodies: number;
    loadedBodies: number;
  }>({ scope: null, documents: [], pendingBodies: 0, loadedBodies: 0 });
  const [isIndexing, setIsIndexing] = useState(false);
  const activeRequest = useRef<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isNativeTitleIndexEnabled()
      .then((value) => {
        if (!cancelled) setEnabledState(value);
      })
      .catch(() => undefined);
    const unsubscribe = subscribeNativeTitleIndexEnabled((value) => {
      activeRequest.current = null;
      setEnabledState(value);
      setIsIndexing(false);
      if (!value)
        setSnapshot({
          scope: null,
          documents: [],
          pendingBodies: 0,
          loadedBodies: 0,
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const rebuild = async () => {
    if (
      !accountId ||
      !enabled ||
      scope?.accountId !== accountId ||
      activeRequest.current
    )
      return;
    const request = {};
    activeRequest.current = request;
    setIsIndexing(true);
    const current = () =>
      activeRequest.current === request && isSessionDataScopeCurrent(scope);
    const load = async () => {
      const documents = await rebuildNativeTitleIndex({ accountId, isCurrent: current });
      if (current())
        setSnapshot({ scope, documents, pendingBodies: 0, loadedBodies: 0 });
    };
    await load().catch(() => undefined);
    if (current()) {
      activeRequest.current = null;
      setIsIndexing(false);
    }
  };
  const rebuildIndex = useEffectEvent(() => rebuild());

  useEffect(() => {
    if (!accountId || !enabled || scope?.accountId !== accountId) return;
    let cancelled = false;
    const refresh = async () => {
      const documents = await readNativeTitleIndex(accountId);
      if (cancelled) return;
      if (!isSessionDataScopeCurrent(scope)) return;
      setSnapshot({ scope, documents, pendingBodies: 0, loadedBodies: 0 });
      await rebuildIndex();
    };
    void refresh().catch(() => undefined);
    const timer = setInterval(() => {
      void rebuildIndex().catch(() => undefined);
    }, REINDEX_INTERVAL_MS);
    return () => {
      cancelled = true;
      activeRequest.current = null;
      clearInterval(timer);
    };
  }, [accountId, enabled, scope]);

  const backfill =
    snapshot.scope === scope &&
    snapshot.pendingBodies > 0 &&
    snapshot.loadedBodies > 0;
  useEffect(() => {
    if (!backfill || isIndexing || !enabled) return;
    const timer = setTimeout(() => {
      void rebuildIndex().catch(() => undefined);
    }, BODY_BACKFILL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [backfill, isIndexing, enabled, snapshot]);

  const setEnabled = async (value: boolean) => {
    await setNativeTitleIndexEnabled(value);
  };
  const visible =
    enabled &&
    scope !== null &&
    snapshot.scope === scope &&
    scope.accountId === accountId;
  return {
    documents: visible ? snapshot.documents : [],
    pendingBodies: visible ? snapshot.pendingBodies : 0,
    isIndexing,
    enabled,
    setEnabled,
    rebuild,
  };
}
