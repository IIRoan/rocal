"use client";

import { useQuery } from "@tanstack/react-query";
import { accountApiService } from "@/lib/api-clients";
import { webQueryKeys } from "@/lib/query-keys";

export function useAuthStatus(
  userId: string | null,
  sessionId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: webQueryKeys.authStatus(userId, sessionId),
    queryFn: () => accountApiService.getAuthStatus(),
    enabled: enabled && Boolean(userId),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
