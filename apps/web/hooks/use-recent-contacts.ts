"use client";

import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addManualContact,
  createEmptyRecentContactsPayload,
  filterContactsList,
  recordRecentContactUsage,
  resolveRecipientSuggestions,
  removeContact,
  updateContactDetails,
  type ContactDetailsPatch,
  type ManualContactInput,
  type RecentContactContext,
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
  const suggestions = resolveRecipientSuggestions(payload, {
    query: options?.query,
    excludeEmails: options?.excludeEmails,
    limit: options?.limit,
  });

  async function persistPayload(next: RecentContactsPayload) {
    const saved = await saveRecentContacts(next);
    if (saved) {
      queryClient.setQueryData(RECENT_CONTACTS_QUERY_KEY, next);
    }
    return saved;
  }

  async function mutatePayload(
    updater: (current: RecentContactsPayload) => RecentContactsPayload,
  ) {
    if (!isAvailable) return false;

    let current = payload ?? (await loadRecentContacts());
    if (!current) {
      current = createEmptyRecentContactsPayload();
    }

    const next = updater(current);
    return persistPayload(next);
  }

  async function updateContact(email: string, patch: ContactDetailsPatch) {
    return mutatePayload((current) => updateContactDetails(current, email, patch));
  }

  async function removeContactByEmail(email: string) {
    return mutatePayload((current) => removeContact(current, email));
  }

  async function addContact(input: ManualContactInput) {
    if (!isAvailable) return false;

    let current = payload ?? (await loadRecentContacts());
    const next = addManualContact(current, input);
    if (!next) return false;
    return persistPayload(next);
  }

  async function flushPendingRecords() {
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
  }

  function recordUsage(
    entries: RecentContactUsageInput[],
    context: RecentContactContext,
  ) {
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
  }

  async function refresh() {
    await recentContactsQuery.refetch();
  }

  return {
    payload,
    suggestions,
    contacts: filterContactsList(payload),
    filterContacts: filterContactsList,
    recordUsage,
    updateContact,
    removeContact: removeContactByEmail,
    addContact,
    refresh,
    isLoading: recentContactsQuery.isLoading,
    isAvailable,
  };
}
