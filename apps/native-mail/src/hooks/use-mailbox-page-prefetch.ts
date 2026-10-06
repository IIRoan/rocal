import { useCallback, useEffect, useRef } from "react";
import type { ViewToken } from "react-native";
import { shouldPrefetchNextMailboxPage } from "../lib/mail/mail-pagination";

type NextPageQuery = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
};

/** Loads the next mailbox page while a page of rows is still below the viewport. */
export function useMailboxPagePrefetch(query: NextPageQuery, rowCount: number) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const requestedRef = useRef(false);
  const loadAheadRef = useRef<(lastVisibleIndex: number) => void>(() => {});

  useEffect(() => {
    loadAheadRef.current = (lastVisibleIndex) => {
      // Query state lags one render behind a request, so guard against a second call cancelling the first.
      if (requestedRef.current) return;
      if (
        !shouldPrefetchNextMailboxPage({
          lastVisibleIndex,
          rowCount,
          hasNextPage,
          isFetchingNextPage,
        })
      ) {
        return;
      }
      requestedRef.current = true;
      // A failed prefetch just stops loading ahead; pull-to-refresh retries it.
      void fetchNextPage()
        .finally(() => {
          requestedRef.current = false;
        })
        .catch(() => undefined);
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, rowCount]);

  const onEndReached = useCallback(() => {
    loadAheadRef.current(Number.MAX_SAFE_INTEGER);
  }, []);

  // FlatList rejects a changing onViewableItemsChanged, so this stays stable and reads the latest state via ref.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let lastVisibleIndex = -1;
      for (const token of viewableItems) {
        if (token.index != null && token.index > lastVisibleIndex) {
          lastVisibleIndex = token.index;
        }
      }
      if (lastVisibleIndex >= 0) loadAheadRef.current(lastVisibleIndex);
    },
    [],
  );

  return { onEndReached, onViewableItemsChanged };
}
