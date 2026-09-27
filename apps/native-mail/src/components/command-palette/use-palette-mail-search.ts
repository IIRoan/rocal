import { skipToken, useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import type { MailRuntime } from "../../lib/mail/mail-runtime";

export function usePaletteMailSearch(
  runtime: MailRuntime | undefined,
  mailboxId: string | null,
  query: string,
  options: { enabled: boolean; limit: number },
) {
  const canSearch = options.enabled && runtime && mailboxId;
  return useQuery({
    queryKey: QUERY_KEYS.paletteMailSearch(mailboxId, query),
    queryFn: canSearch
      ? () =>
          runtime.client.searchMailboxMessages(
            runtime.session,
            mailboxId,
            query,
            options.limit,
          )
      : skipToken,
    staleTime: 10_000,
  });
}
