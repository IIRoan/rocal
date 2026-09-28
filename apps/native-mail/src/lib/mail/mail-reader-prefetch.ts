import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { hasTruncatedBody } from "./mail-offline-snapshot";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage } from "./types";

/** Roughly one screen of rows; anything further is loaded when it scrolls into view. */
export const READER_PREFETCH_LIMIT = 15;

const THREAD_STALE_TIME_MS = 60_000;

function needsFetch(queryClient: QueryClient, queryKey: QueryKey): boolean {
  const state = queryClient.getQueryState(queryKey);
  if (!state) return true;
  // A failed load stays with the reader's own retry instead of being re-fired on every scroll.
  return (
    state.data === undefined &&
    state.fetchStatus === "idle" &&
    state.status !== "error"
  );
}

/** Which reader queries are still missing for the rows on screen, in list order. */
export function selectReaderPrefetchTargets(
  queryClient: QueryClient,
  messages: JmapEmailMessage[],
  limit = READER_PREFETCH_LIMIT,
): { messageIds: string[]; threadIds: string[] } {
  const messageIds: string[] = [];
  const threadIds = new Set<string>();
  for (const message of messages.slice(0, limit)) {
    // Full list copies open straight from the list cache; only capped ones need the detail fetch.
    if (
      hasTruncatedBody(message) &&
      needsFetch(queryClient, QUERY_KEYS.mailMessage(message.id))
    ) {
      messageIds.push(message.id);
    }
    if (
      message.threadId &&
      needsFetch(queryClient, QUERY_KEYS.mailThread(message.threadId))
    ) {
      threadIds.add(message.threadId);
    }
  }
  return { messageIds, threadIds: [...threadIds] };
}

/** Warms the reader for on-screen rows with one batched message fetch and one batched thread fetch. */
export function prefetchReaderData(
  queryClient: QueryClient,
  runtime: MailRuntime,
  messages: JmapEmailMessage[],
): void {
  const { messageIds, threadIds } = selectReaderPrefetchTargets(
    queryClient,
    messages,
  );

  if (messageIds.length > 0) {
    const batch = runtime.client
      .getMessagesByIds(runtime.session, messageIds)
      .then((list) => new Map(list.map((message) => [message.id, message])));
    for (const id of messageIds) {
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.mailMessage(id),
        queryFn: async () => (await batch).get(id) ?? null,
      });
    }
  }

  if (threadIds.length > 0) {
    const batch = runtime.client.getThreadsMessages(runtime.session, threadIds);
    for (const threadId of threadIds) {
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.mailThread(threadId),
        queryFn: async () => (await batch).get(threadId) ?? [],
        staleTime: THREAD_STALE_TIME_MS,
      });
    }
  }
}
