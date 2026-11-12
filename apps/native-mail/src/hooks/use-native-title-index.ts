import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  unknownPrivateSearchCoverage,
  type PrivateSearchCoverage,
  type TitleIndexDocument,
} from "@workspace/calendar-core";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import {
  getSessionDataScope,
  subscribeSessionDataScope,
  isSessionDataScopeCurrent,
  type SessionDataScope,
} from "@workspace/native-core/lib/session-data-lifecycle";
import {
  readNativeTitleIndexSnapshot,
  rebuildNativeTitleIndex,
} from "../lib/search/private-title-index";
import {
  isNativeTitleIndexEnabled,
  setNativeTitleIndexEnabled,
  subscribeNativeTitleIndexEnabled,
} from "@workspace/native-core/lib/search/title-index-store";
import { useMailAccount, useMailRuntime } from "../lib/mail/use-mail";

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
    coverage: PrivateSearchCoverage;
  }>({
    scope: null,
    documents: [],
    pendingBodies: 0,
    loadedBodies: 0,
    coverage: unknownPrivateSearchCoverage(),
  });
  const [isIndexing, setIsIndexing] = useState(false);
  const activeRequest = useRef<object | null>(null);
  const accountQuery = useMailAccount();
  const runtimeQuery = useMailRuntime(
    Boolean(user && accountQuery.data?.provisioned),
  );
  const runtime = runtimeQuery.data;

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
          coverage: unknownPrivateSearchCoverage(),
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
      activeRequest.current ||
      !runtime
    )
      return;
    const request = {};
    activeRequest.current = request;
    setIsIndexing(true);
    const current = () =>
      activeRequest.current === request && isSessionDataScopeCurrent(scope);
    const load = async () => {
      const result = await rebuildNativeTitleIndex({ accountId, runtime, isCurrent: current });
      if (current()) setSnapshot({ scope, ...result });
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
      const stored = await readNativeTitleIndexSnapshot(accountId);
      if (cancelled) return;
      if (!isSessionDataScopeCurrent(scope)) return;
      setSnapshot({
        scope,
        documents: stored.documents,
        pendingBodies: stored.coverage.bodies.pendingMessages ?? 0,
        loadedBodies: 0,
        coverage: stored.coverage,
      });
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
  }, [accountId, enabled, scope, runtime]);

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
    coverage: visible ? snapshot.coverage : unknownPrivateSearchCoverage(),
    documents: visible ? snapshot.documents : [],
    pendingBodies: visible ? snapshot.pendingBodies : 0,
    isIndexing,
    enabled,
    setEnabled,
    rebuild,
  };
}
