import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EVENTS_QUERY_KEY,
  FEED_SYNC_INTERVAL_MS,
  FEED_SYNC_QUERY_KEY,
  SUBSCRIPTIONS_QUERY_KEY,
} from "@workspace/calendar-core";
import type { CalendarApiService } from "./calendar-api-service";

/** Calendar clients sync sealed feeds on open and every 15 minutes while visible; Mail never runs it. */
export function useFeedSync({
  api,
  enabled,
}: {
  api: Pick<CalendarApiService, "syncDueSubscriptions">;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  useQuery({
    queryKey: FEED_SYNC_QUERY_KEY,
    queryFn: async () => {
      const attempted = await api.syncDueSubscriptions();
      if (attempted > 0) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_QUERY_KEY, exact: true }),
          queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY }),
        ]);
      }
      return attempted;
    },
    enabled,
    staleTime: FEED_SYNC_INTERVAL_MS,
    refetchInterval: FEED_SYNC_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
