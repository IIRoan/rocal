import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccountTimezoneSeed, type UserSettings } from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";

/** New accounts default to UTC; adopt this device's zone once per settings row so a failure never loops. */
export function useAccountTimezoneSeed(enabled: boolean): void {
  const queryClient = useQueryClient();
  const seededSettingsId = useRef<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { mutate } = useMutation({
    mutationFn: (timezone: string) =>
      calendarApiService.updateUserSettings({ timezone }),
    onSuccess: (next: UserSettings) => {
      queryClient.setQueryData(QUERY_KEYS.settings(), next);
    },
  });

  useEffect(() => {
    if (!enabled || !settings || seededSettingsId.current === settings.id) return;
    const timezone = getAccountTimezoneSeed(settings);
    if (!timezone) return;
    seededSettingsId.current = settings.id;
    mutate(timezone);
  }, [enabled, settings, mutate]);
}
