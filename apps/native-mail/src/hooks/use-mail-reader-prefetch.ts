import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ViewToken } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MailConversation } from "../lib/mail/conversation-thread";
import { prefetchReaderData } from "../lib/mail/mail-reader-prefetch";
import type { MailRuntime } from "../lib/mail/mail-runtime";

// Rows must stay on screen briefly, so a fling past a page of mail does not fetch all of it.
const READER_PREFETCH_VIEWABILITY = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 300,
};

/** Loads what the reader needs for the rows the user is looking at, so opening them is instant. */
export function useMailReaderPrefetch(runtime: MailRuntime | undefined) {
  const queryClient = useQueryClient();
  const runtimeRef = useRef(runtime);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  // FlatList rejects a changing viewability callback, so this reads the runtime through a ref.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<MailConversation>[] }) => {
      const current = runtimeRef.current;
      if (!current) return;
      const messages = [...viewableItems]
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
        .map((token) => token.item.latestMessage);
      prefetchReaderData(queryClient, current, messages);
    },
    [queryClient],
  );

  return useMemo(
    () => ({ viewabilityConfig: READER_PREFETCH_VIEWABILITY, onViewableItemsChanged }),
    [onViewableItemsChanged],
  );
}
