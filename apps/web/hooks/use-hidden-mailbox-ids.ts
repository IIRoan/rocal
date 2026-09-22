import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  parseHiddenMailboxIds,
  serializeHiddenMailboxIds,
  toggleHiddenMailboxId,
} from "@workspace/calendar-core";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";

const STORAGE_KEY = "mail:hiddenMailboxIds:v1";
const LEGACY_STORAGE_KEY = "mail:hiddenMailboxIds";
const EMPTY_IDS: string[] = [];

function loadHiddenMailboxIds(): string[] {
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, legacy);
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return parseHiddenMailboxIds(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function useHiddenMailboxIds() {
  const queryClient = useQueryClient();
  const { data: hiddenIds = EMPTY_IDS } = useQuery({
    queryKey: mailQueryKeys.hiddenMailboxIds(),
    queryFn: loadHiddenMailboxIds,
    staleTime: Infinity,
  });

  const toggleHidden = (mailboxId: string) => {
    const next = toggleHiddenMailboxId(hiddenIds, mailboxId);
    queryClient.setQueryData(mailQueryKeys.hiddenMailboxIds(), next);
    try {
      localStorage.setItem(STORAGE_KEY, serializeHiddenMailboxIds(next));
    } catch {
      // Private mode / quota: keep the in-memory preference for this session.
    }
  };

  return { hiddenIds, toggleHidden };
}
