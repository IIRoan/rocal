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

/** Field search on this device while the private index is on, so the words never reach the mail server; null means ask the server. */
export async function searchMailboxLocally(input: {
  runtime: MailRuntime;
  mailboxId: string;
  fields: MailSearchFieldValues;
  listFilters: MailListFilters;
  timezone?: string;
}): Promise<JmapEmailMessage[] | null> {
  const accountId = getActiveE2eeSession()?.userId;
  if (!accountId || !(await isNativeTitleIndexEnabled())) return null;
  const documents = (await readNativeTitleIndex(accountId)).filter(
    (document) => document.source === "mail",
  );
  if (documents.length === 0) return null;

  const ids = searchIndexedMailbox(documents, {
    mailboxId: input.mailboxId,
    conditions: fieldSearchConditions(input.fields),
    timezone: input.timezone,
    limit: LOCAL_MAIL_SEARCH_LIMIT,
  });
  const messages = await input.runtime.client.getMessagesByIds(input.runtime.session, ids, {
    view: "row",
  });
  return applyMailListFilters(orderByIds(messages, ids), input.listFilters, {
    now: new Date(),
    timezone: input.timezone,
  });
}
