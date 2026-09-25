import { useQuery } from "@tanstack/react-query";
import { resolveTimezone } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import { useAuth } from "../providers/AuthProvider";

export function useUserTimezone(): string {
  const { isAuthenticated } = useAuth();
  const { data: timezone } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    select: (settings) => settings.timezone,
  });
  return resolveTimezone(timezone);
}
