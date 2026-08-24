import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  loadHiddenMailboxIds,
  saveHiddenMailboxIds,
} from "../lib/mail/hidden-mailboxes-store";
import { toggleHiddenMailboxId } from "../lib/mail/hidden-mailboxes";

export function useHiddenMailboxIds() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEYS.hiddenMailboxIds(),
    queryFn: loadHiddenMailboxIds,
    staleTime: Infinity,
  });

  const persist = useMutation({
    mutationFn: saveHiddenMailboxIds,
    onSuccess: (_result, ids) => {
      queryClient.setQueryData(QUERY_KEYS.hiddenMailboxIds(), ids);
    },
  });

  const hiddenIds = query.data ?? [];

  const toggleHidden = useCallback(
    async (mailboxId: string) => {
      await persist.mutateAsync(toggleHiddenMailboxId(hiddenIds, mailboxId));
    },
    [hiddenIds, persist],
  );

  return {
    hiddenIds,
    isLoading: query.isLoading,
    persistHiddenIds: persist.mutateAsync,
    toggleHidden,
  };
}
