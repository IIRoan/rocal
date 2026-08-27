import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../query-keys";
import {
  flattenMailboxMessagesCache,
  type MailboxMessagesCacheData,
} from "./mail-message-cache";
import {
  filterRelatedThreadMessages,
  getConversationForMessage,
  mergeConversationSourceMessages,
} from "./conversation-thread";
import type { JmapEmailMessage } from "./types";
import type { MailRuntime } from "./mail-runtime";

const MAX_PREFETCH_THREADS = 20;

function getAllCachedMailboxMessages(
  queryClient: ReturnType<typeof useQueryClient>,
): JmapEmailMessage[] {
  const lists = queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: ["mail", "messages"],
  });

  const byId = new Map<string, JmapEmailMessage>();
  for (const [, data] of lists) {
    for (const message of flattenMailboxMessagesCache(data)) {
      byId.set(message.id, message);
    }
  }
  return [...byId.values()];
}

function getCachedThreadMessages(
  queryClient: ReturnType<typeof useQueryClient>,
): JmapEmailMessage[] {
  const lists = queryClient.getQueriesData<JmapEmailMessage[]>({
    queryKey: ["mail", "thread"],
  });
  const byId = new Map<string, JmapEmailMessage>();
  for (const [, messages] of lists) {
    for (const message of messages ?? []) {
      byId.set(message.id, message);
    }
  }
  return [...byId.values()];
}

/** Prefetches thread siblings so the mailbox list can group conversations. */
export function usePrefetchThreadMessages(
  runtime: MailRuntime | undefined,
  messages: JmapEmailMessage[],
) {
  const threadIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.threadId) {
        ids.add(message.threadId);
      }
    }
    return [...ids].slice(0, MAX_PREFETCH_THREADS);
  }, [messages]);

  const queries = useQueries({
    queries: threadIds.map((threadId) => ({
      queryKey: QUERY_KEYS.mailThread(threadId),
      queryFn: () =>
        runtime!.client.getThreadMessages(runtime!.session, threadId),
      enabled: Boolean(runtime),
      staleTime: 60_000,
    })),
  });

  return useMemo(() => {
    const byId = new Map<string, JmapEmailMessage>();
    for (const query of queries) {
      for (const message of query.data ?? []) {
        byId.set(message.id, message);
      }
    }
    return [...byId.values()];
  }, [queries]);
}

function filterMessagesToMailboxes(
  messages: JmapEmailMessage[],
  allowedMailboxIds: ReadonlySet<string>,
): JmapEmailMessage[] {
  if (allowedMailboxIds.size === 0) return [];
  return messages.filter((message) =>
    Object.keys(message.mailboxIds ?? {}).some((mailboxId) =>
      allowedMailboxIds.has(mailboxId),
    ),
  );
}

export function useConversationListExtras(
  runtime: MailRuntime | undefined,
  mailboxMessages: JmapEmailMessage[],
  companionMessages: JmapEmailMessage[],
  allowedMailboxIds: string[],
) {
  const queryClient = useQueryClient();
  const prefetchedThreadMessages = usePrefetchThreadMessages(
    runtime,
    mailboxMessages,
  );
  const allowedMailboxIdSet = useMemo(
    () => new Set(allowedMailboxIds),
    [allowedMailboxIds],
  );

  return useMemo(
    () =>
      filterRelatedThreadMessages(
        mailboxMessages,
        mergeConversationSourceMessages(
          filterMessagesToMailboxes(companionMessages, allowedMailboxIdSet),
          filterMessagesToMailboxes(
            prefetchedThreadMessages,
            allowedMailboxIdSet,
          ),
          filterMessagesToMailboxes(
            getCachedThreadMessages(queryClient),
            allowedMailboxIdSet,
          ),
        ),
      ),
    [
      mailboxMessages,
      companionMessages,
      prefetchedThreadMessages,
      queryClient,
      allowedMailboxIdSet,
    ],
  );
}

export function useConversationThread(
  runtime: MailRuntime | undefined,
  message: JmapEmailMessage | null,
) {
  const queryClient = useQueryClient();
  const threadId = message?.threadId ?? null;

  const threadQuery = useQuery({
    queryKey: QUERY_KEYS.mailThread(threadId),
    enabled: Boolean(runtime && threadId),
    queryFn: () =>
      runtime!.client.getThreadMessages(runtime!.session, threadId!),
    staleTime: 60_000,
  });

  const conversationMessages = useMemo(() => {
    if (!message) return [];

    const threadId = message.threadId;
    const sameThread = (entry: JmapEmailMessage) =>
      entry.id === message.id ||
      Boolean(threadId && entry.threadId === threadId);

    const cached = getAllCachedMailboxMessages(queryClient).filter(sameThread);
    const cachedThreadMessages =
      getCachedThreadMessages(queryClient).filter(sameThread);
    const threadMessages = threadQuery.data ?? [];
    const merged = mergeConversationSourceMessages(
      [message],
      cached,
      cachedThreadMessages,
      threadMessages,
    );
    const conversation = getConversationForMessage(merged, message.id);

    if (conversation.length > 0) {
      return conversation;
    }

    return [message];
  }, [message, queryClient, threadQuery.data]);

  return {
    conversationMessages,
    isLoading: Boolean(threadId) && threadQuery.isLoading,
  };
}
