"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  UnifiedSearchResponse,
  UnifiedSearchResult,
} from "@workspace/calendar-core";
import {
  mergeUnifiedSearchResults,
  searchCalendarEvents,
  searchTitleIndex,
  titleHitToUnifiedResult,
} from "@workspace/calendar-core";
import { loadEventSearchCorpus } from "@workspace/calendar-client";
import { calendarApiService } from "@/lib/calendar-api-service";
import { webQueryKeys } from "@/lib/query-keys";
import { mailDemoApiService } from "@/lib/mail/api-service";
import { StalwartJmapClient } from "@/lib/mail/jmap-client";
import { createMailOAuthTokenManager } from "@/lib/mail/oauth-client";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { usePrivateTitleIndex } from "@/hooks/use-private-title-index";
import { mailDocumentToMessageStub } from "@/lib/search/private-title-index";
import { searchMailMessages } from "@/lib/search/unified-search";

const MAILBOX_PRIORITY: Record<string, number> = {
  inbox: 0,
  archive: 1,
  sent: 2,
  junk: 3,
  trash: 4,
  drafts: 5,
};

const RECENT_MESSAGES_PER_MAILBOX = 40;
const MAX_SEARCHABLE_MAILBOXES = 6;
const MAX_SHARED_MAIL_MESSAGES = 240;

type UseUnifiedSearchOptions = {
  query: string;
  enabled?: boolean;
  limit?: number;
  mailMessages?: JmapEmailMessage[];
  includeMail?: boolean;
  includeCalendar?: boolean;
};

function sortMailboxPriority(role?: string | null) {
  if (!role) return 10;
  return MAILBOX_PRIORITY[role.toLowerCase()] ?? 10;
}

async function loadSharedMailSearchMessages(): Promise<JmapEmailMessage[]> {
  const config = await mailDemoApiService.getConfig();
  const tokenManager = createMailOAuthTokenManager(config.oauth);
  const client = new StalwartJmapClient({
    baseUrl: config.discoveryBaseUrl,
    getAccessToken: () => tokenManager.getAccessToken(),
    onUnauthorized: async () => {
      tokenManager.clear();
      try {
        await tokenManager.getAccessToken();
      } catch {
        // Search can fall back without mail results.
      }
    },
  });
  const session = await client.discoverSession();
  const mailboxes = (await client.getMailboxes(session))
    .slice()
    .sort((left, right) => {
      const priorityDiff =
        sortMailboxPriority(left.role) - sortMailboxPriority(right.role);
      if (priorityDiff !== 0) return priorityDiff;
      if ((left.sortOrder ?? 0) !== (right.sortOrder ?? 0)) {
        return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, MAX_SEARCHABLE_MAILBOXES);

  if (mailboxes.length === 0) {
    return [];
  }

  const pages = await Promise.all(
    mailboxes.map((mailbox) =>
      client.getMailboxMessagesForIndex(session, mailbox.id, {
        limit: RECENT_MESSAGES_PER_MAILBOX,
        position: 0,
      }),
    ),
  );

  const uniqueMessages = new Map<string, JmapEmailMessage>();
  for (const page of pages) {
    for (const message of page.messages) {
      uniqueMessages.set(message.id, message);
    }
  }

  return Array.from(uniqueMessages.values())
    .sort((left, right) =>
      (right.receivedAt ?? "").localeCompare(left.receivedAt ?? ""),
    )
    .slice(0, MAX_SHARED_MAIL_MESSAGES);
}

export function useUnifiedSearch({
  query,
  enabled = true,
  limit = 12,
  mailMessages = [],
  includeMail = true,
  includeCalendar = true,
}: UseUnifiedSearchOptions) {
  const titleIndex = usePrivateTitleIndex();
  const normalizedQuery = query.trim();
  const canSearch = enabled && normalizedQuery.length >= 2;
  const perSourceLimit = Math.max(limit, 1);
  const shouldLoadSharedMailMessages =
    canSearch && includeMail && mailMessages.length === 0;

  // The decrypted corpus stays in memory and is searched here, so search words never reach the server.
  const calendarQuery = useQuery({
    queryKey: webQueryKeys.unifiedSearchCalendarCorpus(),
    queryFn: ({ signal }) =>
      loadEventSearchCorpus(calendarApiService, {}, signal),
    enabled: canSearch && includeCalendar,
    staleTime: 30_000,
  });
  const mailQuery = useQuery({
    queryKey: webQueryKeys.unifiedSearchMailCorpus(),
    queryFn: loadSharedMailSearchMessages,
    enabled: shouldLoadSharedMailMessages,
    staleTime: 5 * 60_000,
  });

  const buildResponse = (): UnifiedSearchResponse<JmapEmailMessage> => {
    if (!canSearch) {
      return {
        results: [],
        total: 0,
        sourceTotals: {},
      };
    }

    const searchableMailMessages =
      mailMessages.length > 0 ? mailMessages : (mailQuery.data ?? []);
    const mailResults = includeMail
      ? searchMailMessages(searchableMailMessages, normalizedQuery, perSourceLimit)
      : [];
    const calendarResults = includeCalendar
      ? searchCalendarEvents(
          calendarQuery.data ?? [],
          normalizedQuery,
          perSourceLimit,
        )
      : [];
    const localHits = searchTitleIndex(
      titleIndex.documents.filter((document) => {
        if (document.source === "mail") return includeMail;
        return includeCalendar;
      }),
      normalizedQuery,
      Math.max(limit * 2, perSourceLimit),
    ).map((hit) =>
      titleHitToUnifiedResult(hit, mailDocumentToMessageStub),
    ) as UnifiedSearchResult<JmapEmailMessage>[];
    // Live calendar hits go first so a tie keeps the full event over the index's stub.
    const results = mergeUnifiedSearchResults(
      [calendarResults, localHits, mailResults],
      limit,
    );

    return {
      results,
      total: results.length,
      sourceTotals: {
        mail: results.filter((result) => result.source === "mail").length,
        calendar: results.filter((result) => result.source === "calendar").length,
      },
      isIndexing: titleIndex.isIndexing,
      isLimited:
        !titleIndex.enabled &&
        ((includeMail && searchableMailMessages.length === 0) ||
          mailQuery.isError === true),
    };
  };
  const response = buildResponse();

  return {
    ...response,
    isFetching:
      calendarQuery.isFetching || mailQuery.isFetching || titleIndex.isIndexing,
    isLoading: calendarQuery.isLoading || mailQuery.isLoading,
    error: calendarQuery.error ?? mailQuery.error,
  };
}
