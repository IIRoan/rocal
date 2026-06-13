"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  UnifiedSearchResponse,
  UnifiedSearchResult,
} from "@workspace/calendar-core";
import type { CalendarEvent as UiCalendarEvent } from "@workspace/ui/components/calendar";
import { calendarApiService } from "@/lib/calendar-api-service";
import type { CalendarEvent as ApiCalendarEvent } from "@/lib/types/calendar";
import { mailDemoApiService } from "@/lib/mail/api-service";
import { StalwartJmapClient } from "@/lib/mail/jmap-client";
import { createMailOAuthTokenManager } from "@/lib/mail/oauth-client";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { searchMailMessages, toCalendarSearchResult } from "@/lib/search/unified-search";

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

function mapApiEvent(e: ApiCalendarEvent): UiCalendarEvent {
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    start: e.start instanceof Date ? e.start : new Date(e.start),
    end: e.end instanceof Date ? e.end : new Date(e.end),
    allDay: e.allDay,
    location: e.location ?? undefined,
    color: e.color ?? e.calendar?.color ?? undefined,
    calendarId: e.calendarId,
    categoryId: e.categoryId ?? undefined,
    userId: e.userId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    recurrence: e.recurrence ?? undefined,
    parentEventId: e.parentEventId ?? undefined,
    encryptedContent: e.encryptedContent,
    blindIndexTokens: e.blindIndexTokens,
    encryptionState: e.encryptionState,
    encryptionKeyVersion: e.encryptionKeyVersion,
  };
}

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
    onUnauthorized: () => {
      tokenManager.clear();
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
  const normalizedQuery = query.trim();
  const canSearch = enabled && normalizedQuery.length >= 2;
  const perSourceLimit = Math.max(limit, 1);
  const shouldLoadSharedMailMessages =
    canSearch && includeMail && mailMessages.length === 0;

  const calendarQuery = useQuery({
    queryKey: ["unified-search", "calendar", normalizedQuery, perSourceLimit],
    queryFn: async ({ signal }) => {
      const result = await calendarApiService.searchEvents(
        { q: normalizedQuery, limit: perSourceLimit },
        signal,
      );
      return result.events.map(mapApiEvent);
    },
    enabled: canSearch && includeCalendar,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
  const mailQuery = useQuery({
    queryKey: ["unified-search", "mail-corpus"],
    queryFn: loadSharedMailSearchMessages,
    enabled: shouldLoadSharedMailMessages,
    staleTime: 5 * 60_000,
  });

  const response = useMemo<UnifiedSearchResponse<JmapEmailMessage>>(() => {
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
      ? (calendarQuery.data ?? []).map((event, index) =>
          toCalendarSearchResult(event, index),
        )
      : [];
    const results = [...mailResults, ...calendarResults]
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
      })
      .slice(0, limit) as UnifiedSearchResult<JmapEmailMessage>[];

    return {
      results,
      total: mailResults.length + calendarResults.length,
      sourceTotals: {
        mail: mailResults.length,
        calendar: calendarResults.length,
      },
      isLimited:
        (includeMail && searchableMailMessages.length === 0) ||
        mailQuery.isError === true,
    };
  }, [
    canSearch,
    includeMail,
    includeCalendar,
    mailMessages,
    mailQuery.data,
    mailQuery.isError,
    normalizedQuery,
    perSourceLimit,
    calendarQuery.data,
    limit,
  ]);

  return {
    ...response,
    isFetching: calendarQuery.isFetching || mailQuery.isFetching,
    isLoading: calendarQuery.isLoading || mailQuery.isLoading,
    error: calendarQuery.error ?? mailQuery.error,
  };
}
