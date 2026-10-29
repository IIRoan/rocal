import {
  applyMailListFilters,
  fieldSearchConditions,
  LOCAL_MAIL_SEARCH_LIMIT,
  orderByIds,
  searchIndexedMailbox,
  type MailListFilters,
  type MailSearchFieldValues,
} from "@workspace/calendar-core";
import { getActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";
import { isNativeTitleIndexEnabled } from "@workspace/native-core/lib/search/title-index-store";
import type { MailRuntime } from "../mail/mail-runtime";
import type { JmapEmailMessage } from "../mail/types";
import { readNativeTitleIndex } from "./private-title-index";

/** Field search on this device while the private index is on, so the words never reach the mail server; null means the index is off. */
export async function searchMailboxLocally(input: {
  runtime: MailRuntime;
  mailboxId: string;
  fields: MailSearchFieldValues;
  listFilters: MailListFilters;
  timezone?: string;
}): Promise<JmapEmailMessage[] | null> {
  if (!(await isNativeTitleIndexEnabled())) return null;
  const accountId = getActiveE2eeSession()?.userId;
  // While the index builds or recovers this finds nothing, rather than sending the words to the server.
  const documents = accountId
    ? (await readNativeTitleIndex(accountId).catch(() => [])).filter(
        (document) => document.source === "mail",
      )
    : [];

  const ids = searchIndexedMailbox(documents, {
    mailboxId: input.mailboxId,
    conditions: fieldSearchConditions(input.fields),
    timezone: input.timezone,
    limit: LOCAL_MAIL_SEARCH_LIMIT,
  });
  const messages =
    ids.length > 0
      ? await input.runtime.client.getMessagesByIds(input.runtime.session, ids, {
          view: "row",
        })
      : [];
  // The index can still list a message in a folder it has left, such as one moved to Trash.
  const current = orderByIds(messages, ids).filter(
    (message) => message.mailboxIds?.[input.mailboxId] === true,
  );
  return applyMailListFilters(current, input.listFilters, {
    now: new Date(),
    timezone: input.timezone,
  });
}
