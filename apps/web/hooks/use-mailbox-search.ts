"use client";

import { useQuery } from "@tanstack/react-query";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";
import { searchMailbox } from "@/lib/mail/mailbox-search";

export function useMailboxSearch(
  input: Parameters<typeof searchMailbox>[0] | null,
) {
  return useQuery({
    queryKey: mailQueryKeys.inlineSearchWithFilters(
      input?.mailboxId ?? null,
      input?.text ?? "",
      input?.filters ?? { conditions: [] },
    ),
    queryFn: () => {
      if (!input) throw new Error("Your mailbox is not connected.");
      return searchMailbox(input);
    },
    enabled: input !== null,
    staleTime: 10_000,
  });
}
