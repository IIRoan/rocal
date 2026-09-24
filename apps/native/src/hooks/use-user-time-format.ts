import { useQuery } from "@tanstack/react-query";
import { resolveTimeFormat, type TimeFormat } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import { useAuth } from "../providers/AuthProvider";

export function useUserTimeFormat(): TimeFormat {
  const { isAuthenticated } = useAuth();
  const { data: timeFormat } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    select: (settings) => settings.timeFormat,
  });
  return resolveTimeFormat(timeFormat);
}
