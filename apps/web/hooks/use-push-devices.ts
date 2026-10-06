"use client";

import { useQuery } from "@tanstack/react-query";
import { pushDevicesQueryOptions } from "@workspace/calendar-client/account-query-options";
import { calendarApiService } from "@/lib/calendar-api-service";

export function usePushDevices(enabled: boolean) {
  return useQuery(pushDevicesQueryOptions(calendarApiService, enabled));
}
