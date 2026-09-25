import { useQuery } from "@tanstack/react-query";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import { useAuth } from "../providers/AuthProvider";

export function useUserWeekStartDay(): number | undefined {
  const { isAuthenticated } = useAuth();
  const { data: weekStartDay } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    select: (settings) => settings.weekStartDay,
  });
  return weekStartDay;
}
