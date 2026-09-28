import { useCallback, useMemo, useState } from "react";
import {
  applyMailListFilters,
  type MailListFilters,
} from "@workspace/calendar-core";
import {
  getPrimaryMailboxId,
  uniqueMessagesById,
} from "../lib/mail/mail-helpers";
import { buildMailboxThreadRows } from "../lib/mail/conversation-thread";
import { useConversationListExtras } from "../lib/mail/use-conversation-thread";
import { useConversationDecryptedPreviews } from "../lib/mail/use-conversation-decrypted-previews";
import { useMailboxMessages } from "../lib/mail/use-mail";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapEmailMessage } from "../lib/mail/types";
import { useMailboxPagePrefetch } from "./use-mailbox-page-prefetch";
import { useMailReaderPrefetch } from "./use-mail-reader-prefetch";

const LIST_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1 };

interface MailboxThreadRowsParams {
  runtime: MailRuntime | undefined;
  mailboxId: string | null;
  searchActive: boolean;
  searchMessages: JmapEmailMessage[];
  searchQuery: ReturnType<typeof useMailboxMessages>;
  listFilters: MailListFilters;
  listFilterActive: boolean;
  timezone?: string;
  refetchRuntime: () => Promise<unknown>;
}

export function useMailboxThreadRows({
  runtime,
  mailboxId,
  searchActive,
  searchMessages,
  searchQuery,
  listFilters,
  listFilterActive,
  timezone,
  refetchRuntime,
}: MailboxThreadRowsParams) {
  const messagesQuery = useMailboxMessages(runtime, mailboxId);

  // Inbox and Sent are read as a pair so a thread shows both sides of the conversation.
  const companionMailboxId = useMemo(() => {
    const mailboxes = runtime?.mailboxes ?? [];
    const role = mailboxes
      .find((mailbox) => mailbox.id === mailboxId)
      ?.role?.toLowerCase();
    if (role === "inbox") {
      return getPrimaryMailboxId(mailboxes, "sent");
    }
    if (role === "sent") {
      return getPrimaryMailboxId(mailboxes, "inbox");
    }
    return null;
  }, [runtime?.mailboxes, mailboxId]);

  const companionMessagesQuery = useMailboxMessages(
    runtime,
    companionMailboxId && companionMailboxId !== mailboxId
      ? companionMailboxId
      : null,
  );

  // Background refetches re-read pages at old offsets, so new mail can repeat a row across a page boundary.
  const mailboxMessages = useMemo(
    () =>
      uniqueMessagesById(
        messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
      ),
    [messagesQuery.data?.pages],
  );
  const companionMessages = useMemo(() => {
    if (!companionMailboxId) return [];
    return (
      companionMessagesQuery.data?.pages.flatMap((page) => page.messages) ?? []
    );
  }, [companionMailboxId, companionMessagesQuery.data?.pages]);

  const allowedMailboxIds = useMemo(
    () =>
      [mailboxId, companionMailboxId].filter((id): id is string => Boolean(id)),
    [mailboxId, companionMailboxId],
  );

  const conversationExtras = useConversationListExtras(
    runtime,
    mailboxMessages,
    companionMessages,
    allowedMailboxIds,
  );

  const primaryMessageIds = useMemo(
    () =>
      new Set(
        [...mailboxMessages, ...searchMessages].map((message) => message.id),
      ),
    [mailboxMessages, searchMessages],
  );

  const allThreadRows = useMemo(
    () => buildMailboxThreadRows(mailboxMessages, conversationExtras),
    [mailboxMessages, conversationExtras],
  );

  const threadRows = useMemo(() => {
    if (!listFilterActive) return allThreadRows;
    const source = searchActive ? searchMessages : mailboxMessages;
    const filtered = applyMailListFilters(source, listFilters, {
      now: new Date(),
      timezone,
    });
    return buildMailboxThreadRows(filtered, conversationExtras);
  }, [
    allThreadRows,
    conversationExtras,
    listFilters,
    listFilterActive,
    mailboxMessages,
    searchActive,
    searchMessages,
    timezone,
  ]);

  const latestMessages = useMemo(
    () => threadRows.map((row) => row.latestMessage),
    [threadRows],
  );
  const decryptedPreviews = useConversationDecryptedPreviews(
    runtime,
    latestMessages,
  );

  const unreadThreadCount = useMemo(
    () =>
      allThreadRows.filter((row) =>
        row.messages.some(
          (entry) =>
            primaryMessageIds.has(entry.id) && !entry.keywords?.["$seen"],
        ),
      ).length,
    [allThreadRows, primaryMessageIds],
  );

  const activeMessagesQuery = searchActive ? searchQuery : messagesQuery;
  const pagePrefetch = useMailboxPagePrefetch(
    activeMessagesQuery,
    threadRows.length,
  );
  const readerPrefetch = useMailReaderPrefetch(runtime);
  const pageViewableChanged = pagePrefetch.onViewableItemsChanged;
  // FlatList throws if these pairs change after mount; both callbacks are stable.
  const viewabilityConfigCallbackPairs = useMemo(
    () => [
      {
        viewabilityConfig: LIST_VIEWABILITY_CONFIG,
        onViewableItemsChanged: pageViewableChanged,
      },
      readerPrefetch,
    ],
    [pageViewableChanged, readerPrefetch],
  );

  // Only a user pull shows the spinner; background sync refetches stay invisible.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const refetchActiveMessages = activeMessagesQuery.refetch;
  const refetchCompanionMessages = companionMessagesQuery.refetch;
  const handlePullRefresh = useCallback(() => {
    setPullRefreshing(true);
    void Promise.allSettled([
      refetchRuntime(),
      refetchActiveMessages(),
      refetchCompanionMessages(),
    ]).finally(() => setPullRefreshing(false));
  }, [refetchActiveMessages, refetchCompanionMessages, refetchRuntime]);

  return {
    mailboxMessages,
    conversationExtras,
    primaryMessageIds,
    threadRows,
    decryptedPreviews,
    unreadThreadCount,
    onEndReached: pagePrefetch.onEndReached,
    viewabilityConfigCallbackPairs,
    fetchingNextPage: activeMessagesQuery.isFetchingNextPage,
    listPending: messagesQuery.isPending && !messagesQuery.data,
    pullRefreshing,
    handlePullRefresh,
  };
}
