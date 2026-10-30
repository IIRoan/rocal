import { useQuery } from "@tanstack/react-query";
import { loadEventSearchCorpus } from "@workspace/calendar-client";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

/** The owner's events decrypted in memory for palette search, so no search words reach the server. */
export function usePaletteEventCorpus(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.paletteEventCorpus(),
    queryFn: ({ signal }) =>
      loadEventSearchCorpus(calendarApiService, {}, signal),
    enabled,
    staleTime: 30_000,
  });
}
