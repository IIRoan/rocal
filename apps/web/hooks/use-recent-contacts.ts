"use client";

import { useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmptyRecentContactsPayload,
  filterRecentContactSuggestions,
  recordRecentContactUsage,
  type RecentContactContext,
  type RecentContactEntry,
  type RecentContactUsageInput,
  type RecentContactsPayload,
} from "@workspace/calendar-core";
import { useSession } from "@/lib/auth-client";
import { hasActiveE2eeSession } from "@/lib/e2ee-session";
import {
  loadRecentContacts,
  saveRecentContacts,
} from "@/lib/e2ee-recent-contacts";

const RECENT_CONTACTS_QUERY_KEY = ["recent-contacts"] as const;
const RECORD_DEBOUNCE_MS = 500;

export function useRecentContacts(options?: {
  query?: string;
  excludeEmails?: string[];
  limit?: number;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEntriesRef = useRef<
    Array<{ entries: RecentContactUsageInput[]; context: RecentContactContext }>
  >([]);

  const isAvailable = hasActiveE2eeSession();

  const recentContactsQuery = useQuery<RecentContactsPayload | null>({
    queryKey: RECENT_CONTACTS_QUERY_KEY,
    queryFn: loadRecentContacts,
    enabled: Boolean(session?.user) && isAvailable,
    staleTime: 60_000,
    retry: false,
  });

  const payload = recentContactsQuery.data ?? null;

  const suggestions = useMemo<RecentContactEntry[]>(() => {
    if (!payload) return [];
    return filterRecentContactSuggestions(payload, {
      query: options?.query,
      excludeEmails: options?.excludeEmails,
      limit: options?.limit,
    });
  }, [payload, options?.query, options?.excludeEmails, options?.limit]);

  const flushPendingRecords = useCallback(async () => {
    const pending = pendingEntriesRef.current.splice(0);
    if (pending.length === 0) {
      return;
    }

    let current = await loadRecentContacts();
    if (!current) {
      return;
    }

    for (const batch of pending) {
      current = recordRecentContactUsage(current, batch.entries, batch.context);
    }

    const saved = await saveRecentContacts(current);
    if (saved) {
      queryClient.setQueryData(RECENT_CONTACTS_QUERY_KEY, current);
    }
  }, [queryClient]);

  const recordUsage = useCallback(
    (entries: RecentContactUsageInput[], context: RecentContactContext) => {
      if (!isAvailable || entries.length === 0) {
        return;
      }

      pendingEntriesRef.current.push({ entries, context });

      if (recordTimerRef.current) {
        clearTimeout(recordTimerRef.current);
      }

      recordTimerRef.current = setTimeout(() => {
        recordTimerRef.current = null;
        void flushPendingRecords();
      }, RECORD_DEBOUNCE_MS);
    },
    [flushPendingRecords, isAvailable],
  );

  const refresh = useCallback(async () => {
    await recentContactsQuery.refetch();
  }, [recentContactsQuery]);

  return {
    payload,
    suggestions,
    recordUsage,
    refresh,
    isLoading: recentContactsQuery.isLoading,
    isAvailable,
  };
}
