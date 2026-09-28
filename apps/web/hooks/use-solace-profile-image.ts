"use client";

import { useQuery } from "@tanstack/react-query";
import { createSolaceProfileLookupBatcher } from "@workspace/calendar-client";
import {
  normalizeParticipantEmail,
  solaceProfileImageQueryKey,
} from "@workspace/calendar-core";
import { calendarApiService } from "@/lib/calendar-api-service";
import { resolveAvatarUrl } from "@/lib/profile-picture";

const profileLookupBatcher = createSolaceProfileLookupBatcher((emails) =>
  calendarApiService.lookupSolaceProfiles({ emails }),
);

export function useSolaceProfileImage(
  email?: string | null,
  options?: { enabled?: boolean },
): string | null {
  const normalized = normalizeParticipantEmail(email);
  const enabled = Boolean(normalized) && (options?.enabled ?? true);

  const query = useQuery({
    queryKey: solaceProfileImageQueryKey(normalized),
    queryFn: async () => {
      const avatarPath = await profileLookupBatcher.get(normalized);
      return resolveAvatarUrl(avatarPath) ?? null;
    },
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  return query.data ?? null;
}
