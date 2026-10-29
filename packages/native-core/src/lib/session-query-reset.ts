import type { QueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "./query-keys";

/** Drops E2EE data fetched before the session was ready; reset (not remove) so mounted screens refetch instead of staying orphaned. */
export function resetPreSessionQueries(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.resetQueries({ queryKey: QUERY_KEYS.eventsRoot() }),
    queryClient.resetQueries({ queryKey: QUERY_KEYS.calendars() }),
    queryClient.resetQueries({ queryKey: QUERY_KEYS.categories() }),
    // Settings keep their readable time zone on screen while the sealed preferences are fetched again.
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() }),
  ]).then(() => undefined);
}
