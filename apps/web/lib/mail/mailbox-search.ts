import {
  buildJmapFilter,
  LOCAL_MAIL_SEARCH_LIMIT,
  matchesMessageConditions,
  orderByIds,
  searchIndexedMailbox,
  type MailSearchFilters,
} from "@workspace/calendar-core";
import { getActiveE2eeSession } from "@/lib/e2ee-session";
import { loadLocalMailSearchDocuments } from "@/lib/search/private-title-index";
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
}): Promise<JmapEmailMessage[]> {
  const { client, session, mailboxId, text, filters, timezone, limit } = input;
  const accountId = getActiveE2eeSession()?.userId;
  const documents = accountId ? await loadLocalMailSearchDocuments(accountId) : null;

  if (documents) {
    const conditions = filters?.conditions ?? [];
    const filtersMessages = conditions.some(
      (condition) => condition.hasAttachment || condition.isFlagged || condition.isUnread,
    );
    const ids = searchIndexedMailbox(documents, {
      mailboxId,
      text: text || filters?.text,
      conditions,
      timezone,
      limit: filtersMessages ? LOCAL_MAIL_SEARCH_LIMIT : limit,
    });
    const messages = await client.getMessagesByIds(session, ids, { includeBodies: false });
    return orderByIds(messages, ids)
      .filter((message) => matchesMessageConditions(message, conditions))
      .slice(0, limit);
  }

  if (!filters) {
    return (await client.searchMailboxMessages(session, mailboxId, text, limit)).messages;
  }
  const jmapFilter = buildJmapFilter(
    mailboxId,
    { ...filters, text: text || filters.text?.trim() || undefined },
    { timezone },
  );
  return (
    await client.searchMailboxMessagesWithFilter(session, mailboxId, jmapFilter, limit)
  ).messages;
}
