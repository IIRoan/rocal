import { useQuery } from "@tanstack/react-query";
import { getDeviceTimezone, resolveTimezone } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import { useAuth } from "../providers/AuthProvider";

/** Account timezone once settings load; this device's zone while hydrating so the calendar never jumps to Amsterdam. */
export function useUserTimezone(): string {
  const { isAuthenticated } = useAuth();
  const { data: timezone, isSuccess } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    select: (settings) => settings.timezone,
  });
  if (!isSuccess) return getDeviceTimezone();
  return resolveTimezone(timezone);
}
