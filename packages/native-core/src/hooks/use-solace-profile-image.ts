import { useQuery } from "@tanstack/react-query";
import { createSolaceProfileLookupBatcher } from "@workspace/calendar-client";
import {
  normalizeParticipantEmail,
  solaceProfileImageQueryKey,
} from "@workspace/calendar-core";
import { calendarApiService } from "../lib/api";

const profileLookupBatcher = createSolaceProfileLookupBatcher((emails) =>
  calendarApiService.lookupSolaceProfiles({ emails }),
);

/** API-relative avatar path for an email; callers resolve it for their display size. */
export function useSolaceProfileImage(
  email?: string | null,
  options?: { enabled?: boolean },
): string | null {
  const normalized = normalizeParticipantEmail(email);
  const enabled = Boolean(normalized) && (options?.enabled ?? true);

  const query = useQuery({
    queryKey: solaceProfileImageQueryKey(normalized),
    queryFn: async () => (await profileLookupBatcher.get(normalized)) ?? null,
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });

  return query.data ?? null;
}
