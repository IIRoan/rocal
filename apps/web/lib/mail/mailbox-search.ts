import {
  buildJmapFilter,
  resolveMailSearchScope,
  searchIndexedMailboxMessages,
  type MailSearchFilters,
  type PrivateMailSearchResult,
  unknownPrivateSearchCoverage,
} from "@workspace/calendar-core";
import { getActiveE2eeSession } from "@/lib/e2ee-session";
import { isPrivateContentIndexEnabled } from "@/lib/search/private-index-flags";
import { loadPrivateTitleIndex } from "@/lib/search/private-title-index";
import type { StalwartJmapClient } from "./jmap-client";
import type { JmapEmailMessage, JmapSession } from "./types";

/** Searches a mailbox on this device while the private index is on, so the words never reach the mail server. */
export async function searchMailbox(input: {
  client: StalwartJmapClient;
  session: JmapSession;
  mailboxId: string;
  text: string;
  filters: MailSearchFilters | null;
  timezone?: string | null;
  limit: number;
}): Promise<PrivateMailSearchResult<JmapEmailMessage>> {
  const { client, session, mailboxId, text, filters, timezone, limit } = input;
  const scope = resolveMailSearchScope(mailboxId, filters);

  if (isPrivateContentIndexEnabled()) {
    const accountId = getActiveE2eeSession()?.userId;
    // While the index builds or recovers this finds nothing, rather than sending the words to the server.
    const snapshot = accountId ? await loadPrivateTitleIndex(accountId) : null;
    const result = await searchIndexedMailboxMessages({
      documents: snapshot?.documents ?? [],
      mailboxId: scope,
      text: text || filters?.text,
      conditions: filters?.conditions ?? [],
      timezone,
      limit,
      getMessagesByIds: (ids) =>
        client.getMessagesByIds(session, ids, { includeBodies: false }),
    });
    return {
      ...result,
      coverage: snapshot?.coverage ?? unknownPrivateSearchCoverage(),
      limit,
    };
  }

  if (!filters) {
    const result = await client.searchMailboxMessages(
      session,
      mailboxId,
      text,
      limit,
    );
    return {
      messages: result.messages,
      coverage: null,
      matchCount: result.messages.length,
      limit,
    };
  }
  const jmapFilter = buildJmapFilter(
    mailboxId,
    { ...filters, text: text || filters.text?.trim() || undefined },
    { timezone },
  );
  const result = await client.searchMailboxMessagesWithFilter(
    session,
    scope,
    jmapFilter,
    limit,
  );
  return {
    messages: result.messages,
    coverage: null,
    matchCount: result.messages.length,
    limit,
  };
}
