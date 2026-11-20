import { skipToken, useQuery } from "@tanstack/react-query";
import {
  buildJmapFilter,
  hasMailSearchConditions,
  resolveMailSearchScope,
  searchIndexedMailboxMessages,
  type ParsedMailSearch,
} from "@workspace/calendar-core";
import { getActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import type { MailRuntime } from "../../lib/mail/mail-runtime";
import type { JmapEmailMessage } from "../../lib/mail/types";
import { readNativeTitleIndexSnapshot } from "../../lib/search/private-title-index";

type PaletteMailSearchInput = {
  runtime: MailRuntime;
  mailboxId: string;
  query: string;
  parsed: ParsedMailSearch;
  searchesLocally: boolean;
  timezone?: string;
  limit: number;
};

/** Typed operators run over the on-device index while it is on, else as a JMAP filter; plain words keep today's text search. */
async function searchPaletteMail(
  input: PaletteMailSearchInput,
): Promise<{ messages: JmapEmailMessage[] }> {
  const { runtime, parsed, limit } = input;
  if (!hasMailSearchConditions(parsed)) {
    return runtime.client.searchMailboxMessages(runtime.session, input.mailboxId, input.query, limit);
  }
  const filters = { ...parsed.filters, text: parsed.text || undefined };
  const scope = resolveMailSearchScope(input.mailboxId, filters);
  if (!input.searchesLocally) {
    return runtime.client.searchMailboxMessagesWithFilter(
      runtime.session,
      scope,
      buildJmapFilter(input.mailboxId, filters, { timezone: input.timezone }),
      limit,
    );
  }
  const accountId = getActiveE2eeSession()?.userId;
  // While the index builds or recovers this finds nothing, rather than sending the words to the server.
  const snapshot = accountId
    ? await readNativeTitleIndexSnapshot(accountId).catch(() => null)
    : null;
  return searchIndexedMailboxMessages({
    documents: (snapshot?.documents ?? []).filter((document) => document.source === "mail"),
    mailboxId: scope,
    text: parsed.text,
    conditions: filters.conditions,
    timezone: input.timezone,
    limit,
    getMessagesByIds: (ids) =>
      runtime.client.getMessagesByIds(runtime.session, ids, { view: "row" }),
  });
}

export function usePaletteMailSearch(
  runtime: MailRuntime | undefined,
  mailboxId: string | null,
  query: string,
  options: {
    enabled: boolean;
    limit: number;
    parsed: ParsedMailSearch;
    searchesLocally: boolean;
    timezone?: string;
  },
) {
  const canSearch = options.enabled && runtime && mailboxId;
  return useQuery({
    queryKey: QUERY_KEYS.paletteMailSearch(
      mailboxId ? resolveMailSearchScope(mailboxId, options.parsed.filters) : null,
      query,
    ),
    queryFn: canSearch
      ? () =>
          searchPaletteMail({
            runtime,
            mailboxId,
            query,
            parsed: options.parsed,
            searchesLocally: options.searchesLocally,
            timezone: options.timezone,
            limit: options.limit,
          })
      : skipToken,
    staleTime: 10_000,
  });
}
