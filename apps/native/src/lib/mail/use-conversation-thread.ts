import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../query-keys";
import {
  getConversationForMessage,
  mergeConversationSourceMessages,
} from "./conversation-thread";
import type { JmapEmailMessage } from "./types";
import type { MailRuntime } from "./mail-runtime";

const MAX_PREFETCH_THREADS = 20;

function getAllCachedMailboxMessages(
  queryClient: ReturnType<typeof useQueryClient>,
): JmapEmailMessage[] {
  const lists = queryClient.getQueriesData<{
    messages: JmapEmailMessage[];
    total: number;
  }>({ queryKey: ["mail", "messages"] });

  const byId = new Map<string, JmapEmailMessage>();
  for (const [, data] of lists) {
    for (const message of data?.messages ?? []) {
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

export function useConversationListExtras(
  runtime: MailRuntime | undefined,
  mailboxMessages: JmapEmailMessage[],
  companionMessages: JmapEmailMessage[],
) {
  const queryClient = useQueryClient();
  const prefetchedThreadMessages = usePrefetchThreadMessages(
    runtime,
    mailboxMessages,
  );

  return useMemo(
    () =>
      mergeConversationSourceMessages(
        companionMessages,
        prefetchedThreadMessages,
        getCachedThreadMessages(queryClient),
      ),
    [companionMessages, prefetchedThreadMessages, queryClient],
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

    const cached = getAllCachedMailboxMessages(queryClient);
    const threadMessages = threadQuery.data ?? [];
    const merged = mergeConversationSourceMessages(cached, threadMessages);
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
