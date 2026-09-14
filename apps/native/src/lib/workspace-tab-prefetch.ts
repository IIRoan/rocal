import type { QueryClient } from "@tanstack/react-query";
import {
  getPaddedCalendarMonthRange,
  resolveMailboxMessagesPageSize,
  resolveTimezone,
} from "@workspace/calendar-core";
import { calendarApiService } from "./api";
import { QUERY_KEYS } from "./query-keys";
import { getMailAccountStatus, getMailConfig } from "./mail/mail-api";
import { buildMailRuntime } from "./mail/mail-runtime";
import { getPrimaryMailboxId, sortMessagesByDate } from "./mail/mail-helpers";
import { MAILBOX_MESSAGES_PAGE_SIZE } from "./mail/mail-pagination";

/**
 * Warm React Query caches for calendar and mail so tab switches feel instant.
 */
export async function prefetchWorkspaceTabs(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.settings(),
      queryFn: () => calendarApiService.getUserSettings(),
      staleTime: 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.calendars(),
      queryFn: () => calendarApiService.getCalendars(),
      staleTime: Infinity,
    }),
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.mailConfig(),
      queryFn: getMailConfig,
      staleTime: 5 * 60_000,
    }),
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.mailAccount(),
      queryFn: getMailAccountStatus,
      staleTime: 60_000,
    }),
  ]);

  const settings = queryClient.getQueryData<
    Awaited<ReturnType<typeof calendarApiService.getUserSettings>>
  >(QUERY_KEYS.settings());
  const timezone = resolveTimezone(settings?.timezone);
  const monthRange = getPaddedCalendarMonthRange(new Date(), undefined, timezone);

  await queryClient.prefetchQuery({
    queryKey: QUERY_KEYS.events(
      monthRange.start.toISOString(),
      monthRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(monthRange.start, monthRange.end),
    staleTime: 120_000,
  });

  await prefetchMailWorkspace(queryClient);
}

async function prefetchMailWorkspace(queryClient: QueryClient): Promise<void> {
  try {
    const account = await queryClient.fetchQuery({
      queryKey: QUERY_KEYS.mailAccount(),
      queryFn: getMailAccountStatus,
      staleTime: 60_000,
    });
    if (!account.provisioned) {
      return;
    }

    const runtime = await queryClient.fetchQuery({
      queryKey: QUERY_KEYS.mailRuntime(),
      queryFn: buildMailRuntime,
      staleTime: 5 * 60_000,
    });

    const inboxId =
      getPrimaryMailboxId(runtime.mailboxes, "inbox") ??
      runtime.mailboxes[0]?.id ??
      null;
    if (!inboxId) {
      return;
    }

    const pageSize = resolveMailboxMessagesPageSize(
      runtime.mailServerPolicy,
      MAILBOX_MESSAGES_PAGE_SIZE,
    );

    await queryClient.prefetchInfiniteQuery({
      queryKey: QUERY_KEYS.mailMessages(inboxId),
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => {
        const { messages, total } = await runtime.client.getMailboxMessages(
          runtime.session,
          inboxId,
          { limit: pageSize, position: pageParam },
        );
        return {
          messages: sortMessagesByDate(messages),
          total,
          position: pageParam,
        };
      },
      getNextPageParam: (lastPage) => {
        const nextPosition = lastPage.position + lastPage.messages.length;
        if (lastPage.total > 0) {
          return nextPosition < lastPage.total ? nextPosition : undefined;
        }
        return lastPage.messages.length >= pageSize ? nextPosition : undefined;
      },
      pages: 1,
    });
  } catch {
    // Mail may be unavailable while calendar still works.
  }
}
