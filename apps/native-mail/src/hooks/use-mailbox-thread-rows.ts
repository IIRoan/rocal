import { useState } from "react";
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

/** Conversation rows pull replies from the opposite folder: Sent for Inbox, Inbox for Sent. */
function companionMailboxIdFor(
  mailboxes: MailRuntime["mailboxes"],
  mailboxId: string | null,
): string | null {
  const role = mailboxes
    .find((mailbox) => mailbox.id === mailboxId)
    ?.role?.toLowerCase();
  if (role === "inbox") return getPrimaryMailboxId(mailboxes, "sent");
  if (role === "sent") return getPrimaryMailboxId(mailboxes, "inbox");
  return null;
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
  const companionMailboxId = companionMailboxIdFor(
    runtime?.mailboxes ?? [],
    mailboxId,
  );

  const companionMessagesQuery = useMailboxMessages(
    runtime,
    companionMailboxId && companionMailboxId !== mailboxId
      ? companionMailboxId
      : null,
  );

  // Background refetches re-read pages at old offsets, so new mail can repeat a row across a page boundary.
  const mailboxMessages = uniqueMessagesById(
    messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
  );
  const companionMessages = companionMailboxId
    ? (companionMessagesQuery.data?.pages.flatMap((page) => page.messages) ??
      [])
    : [];

  const allowedMailboxIds = [mailboxId, companionMailboxId].filter((id): id is string => Boolean(id));

  const conversationExtras = useConversationListExtras(
    runtime,
    mailboxMessages,
    companionMessages,
    allowedMailboxIds,
  );

  const primaryMessageIds = new Set(
    [...mailboxMessages, ...searchMessages].map((message) => message.id),
  );

  const allThreadRows = buildMailboxThreadRows(mailboxMessages, conversationExtras);

  const threadRows = listFilterActive
    ? buildMailboxThreadRows(
        applyMailListFilters(
          searchActive ? searchMessages : mailboxMessages,
          listFilters,
          { now: new Date(), timezone },
        ),
        conversationExtras,
      )
    : allThreadRows;

  const latestMessages = threadRows.map((row) => row.latestMessage);
  const decryptedPreviews = useConversationDecryptedPreviews(
    runtime,
    latestMessages,
  );

  const unreadThreadCount = allThreadRows.filter((row) =>
    row.messages.some(
      (entry) =>
        primaryMessageIds.has(entry.id) && !entry.keywords?.["$seen"],
    ),
  ).length;

  const activeMessagesQuery = searchActive ? searchQuery : messagesQuery;
  const pagePrefetch = useMailboxPagePrefetch(
    activeMessagesQuery,
    threadRows.length,
  );
  const readerPrefetch = useMailReaderPrefetch(runtime);
  const pageViewableChanged = pagePrefetch.onViewableItemsChanged;
  // FlatList throws if these pairs change after mount; both callbacks are stable.
  const viewabilityConfigCallbackPairs = [
    {
      viewabilityConfig: LIST_VIEWABILITY_CONFIG,
      onViewableItemsChanged: pageViewableChanged,
    },
    readerPrefetch,
  ];

  // Only a user pull shows the spinner; background sync refetches stay invisible.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const refetchActiveMessages = activeMessagesQuery.refetch;
  const refetchCompanionMessages = companionMessagesQuery.refetch;
  const handlePullRefresh = () => {
    setPullRefreshing(true);
    // allSettled never rejects, so the catch only backstops the spinner reset.
    void Promise.allSettled([
      refetchRuntime(),
      refetchActiveMessages(),
      refetchCompanionMessages(),
    ])
      .finally(() => setPullRefreshing(false))
      .catch(() => undefined);
  };

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
