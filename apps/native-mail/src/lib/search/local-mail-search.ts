import {
  applyMailListFilters,
  fieldSearchConditions,
  LOCAL_MAIL_SEARCH_LIMIT,
  searchIndexedMailboxMessages,
  type MailListFilters,
  type MailSearchFieldValues,
  type PrivateMailSearchResult,
  unknownPrivateSearchCoverage,
} from "@workspace/calendar-core";
import { getActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";
import { isNativeTitleIndexEnabled } from "@workspace/native-core/lib/search/title-index-store";
import type { MailRuntime } from "../mail/mail-runtime";
import type { JmapEmailMessage } from "../mail/types";
import { readNativeTitleIndexSnapshot } from "./private-title-index";

/** Field search on this device while the private index is on, so the words never reach the mail server; null means the index is off. */
export async function searchMailboxLocally(input: {
  runtime: MailRuntime;
  mailboxId: string;
  fields: MailSearchFieldValues;
  listFilters: MailListFilters;
  timezone?: string;
}): Promise<PrivateMailSearchResult<JmapEmailMessage> | null> {
  if (!(await isNativeTitleIndexEnabled())) return null;
  const accountId = getActiveE2eeSession()?.userId;
  // While the index builds or recovers this finds nothing, rather than sending the words to the server.
  const snapshot = accountId
    ? await readNativeTitleIndexSnapshot(accountId).catch(() => null)
    : null;
  const documents = (snapshot?.documents ?? []).filter(
    (document) => document.source === "mail",
  );

  const result = await searchIndexedMailboxMessages({
    documents,
    mailboxId: input.mailboxId,
    conditions: fieldSearchConditions(input.fields),
    timezone: input.timezone,
    limit: LOCAL_MAIL_SEARCH_LIMIT,
    getMessagesByIds: (ids) =>
      input.runtime.client.getMessagesByIds(input.runtime.session, ids, { view: "row" }),
  });
  return {
    messages: applyMailListFilters(result.messages, input.listFilters, {
      now: new Date(),
      timezone: input.timezone,
    }),
    coverage: snapshot?.coverage ?? unknownPrivateSearchCoverage(),
    matchCount: result.matchCount,
    limit: LOCAL_MAIL_SEARCH_LIMIT,
  };
}
