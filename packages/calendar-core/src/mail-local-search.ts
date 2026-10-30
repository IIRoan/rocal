import { normalizeSearchText } from "./mail-search-relevance";
import {
  buildMailSearchFilters,
  toJmapUtcDate,
  type MailSearchFieldValues,
  type MailSearchFilterCondition,
} from "./mail-search-filter";
import { searchTitleIndex, type TitleIndexDocument } from "./title-search-index";

/** Bounds a mailbox search over the on-device index; matches are fetched by id, never by the words. */
export const LOCAL_MAIL_SEARCH_LIMIT = 200;

function contains(value: string | undefined, query: string | undefined): boolean {
  const needle = query?.trim();
  if (!needle) return true;
  return normalizeSearchText(value ?? "").includes(normalizeSearchText(needle));
}

function receivedMs(document: TitleIndexDocument): number {
  return document.timestamp ? Date.parse(document.timestamp) : Number.NaN;
}

function matchesIndexedCondition(
  document: TitleIndexDocument,
  condition: MailSearchFilterCondition,
  timezone: string | null | undefined,
): boolean {
  if (!contains(document.from ?? document.subtitle, condition.from)) return false;
  if (!contains(document.to, condition.to)) return false;
  if (!contains(document.title, condition.subject)) return false;
  if (!contains(document.body, condition.body)) return false;
  const before = condition.before ? toJmapUtcDate(condition.before, timezone) : null;
  if (before && !(receivedMs(document) < Date.parse(before))) return false;
  const after = condition.after ? toJmapUtcDate(condition.after, timezone) : null;
  if (after && !(receivedMs(document) >= Date.parse(after))) return false;
  return true;
}

/** Message ids in a mailbox matching the search on this device, best text match first, else newest first. */
export function searchIndexedMailbox(
  documents: TitleIndexDocument[],
  input: {
    mailboxId: string;
    text?: string;
    conditions?: MailSearchFilterCondition[];
    timezone?: string | null;
    limit?: number;
  },
): string[] {
  const inMailbox = documents.filter(
    (document) =>
      document.source === "mail" && document.mailboxIds?.includes(input.mailboxId),
  );
  const text = input.text?.trim();
  const ranked = text
    ? searchTitleIndex(inMailbox, text, inMailbox.length).map((hit) => hit.document)
    : [...inMailbox].sort((left, right) => (receivedMs(right) || 0) - (receivedMs(left) || 0));
  return ranked
    .filter((document) =>
      (input.conditions ?? []).every((condition) =>
        matchesIndexedCondition(document, condition, input.timezone),
      ),
    )
    .slice(0, input.limit ?? LOCAL_MAIL_SEARCH_LIMIT)
    .map((document) => document.messageId ?? document.id.replace(/^mail:/, ""));
}

/** The keyword and attachment parts of a search, checked on the messages fetched by id. */
export function matchesMessageConditions(
  message: { keywords?: Record<string, boolean> | null; hasAttachment?: boolean | null },
  conditions: MailSearchFilterCondition[],
): boolean {
  return conditions.every(
    (condition) =>
      (!condition.hasAttachment || message.hasAttachment === true) &&
      (!condition.isFlagged || message.keywords?.$flagged === true) &&
      (!condition.isUnread || message.keywords?.$seen !== true),
  );
}

/** Native's field search as conditions, without the list toggles (those apply to the fetched messages). */
export function fieldSearchConditions(
  fields: MailSearchFieldValues,
): MailSearchFilterCondition[] {
  return buildMailSearchFilters(fields, {
    readState: "all",
    starred: false,
    attachments: false,
  }).conditions;
}

/** Keeps fetched messages in the order the index ranked their ids. */
export function orderByIds<T extends { id: string }>(messages: T[], ids: string[]): T[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return ids.flatMap((id) => {
    const message = byId.get(id);
    return message ? [message] : [];
  });
}
