import { useQuery } from "@tanstack/react-query";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

export function usePaletteEventSearch(
  query: string,
  options: { enabled: boolean; limit: number },
) {
  return useQuery({
    queryKey: QUERY_KEYS.paletteEventSearch(query),
    queryFn: ({ signal }) =>
      calendarApiService.searchEvents({ q: query, limit: options.limit }, signal),
    enabled: options.enabled,
    staleTime: 10_000,
  });
}
