import { useQueries } from "@tanstack/react-query";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";

type MiniCalendarMonthRange = { range: { start: Date; end: Date } };

/** One events query per mounted mini-calendar month, so paging reuses cached neighbours. */
export function useMiniCalendarMonthEvents(
  monthWindow: MiniCalendarMonthRange[],
  staleTime: number,
) {
  return useQueries({
    queries: monthWindow.map(({ range }) => ({
      queryKey: QUERY_KEYS.events(
        range.start.toISOString(),
        range.end.toISOString(),
      ),
      queryFn: () => calendarApiService.getEvents(range.start, range.end),
      staleTime,
    })),
  });
}
