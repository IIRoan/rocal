import { getMailListAgeCutoff, type MailListFilters } from "./mail-list-view-filter";
import { getZonedDayUtcBounds, resolveTimezone } from "./timezone";

export type MailSearchFilterCondition = {
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  hasAttachment?: boolean;
  before?: string;
  after?: string;
  isFlagged?: boolean;
  isUnread?: boolean;
};

export type MailSearchFilters = {
  text?: string;
  conditions: MailSearchFilterCondition[];
};

export type MailSearchChip = {
  field: keyof MailSearchFilterCondition;
  value: string | boolean;
  label: string;
};

export type MailSearchFieldType = "text" | "date" | "boolean";

export const SEARCH_FILTER_FIELDS: {
  field: keyof MailSearchFilterCondition;
  label: string;
  placeholder: string;
  type: MailSearchFieldType;
}[] = [
  { field: "from", label: "From", placeholder: "sender@example.com", type: "text" },
  { field: "to", label: "To", placeholder: "recipient@example.com", type: "text" },
  { field: "subject", label: "Subject", placeholder: "Subject contains…", type: "text" },
  { field: "body", label: "Body", placeholder: "Body contains…", type: "text" },
  { field: "hasAttachment", label: "Has attachment", placeholder: "", type: "boolean" },
  { field: "before", label: "Before", placeholder: "YYYY-MM-DD", type: "date" },
  { field: "after", label: "After", placeholder: "YYYY-MM-DD", type: "date" },
  { field: "isFlagged", label: "Starred", placeholder: "", type: "boolean" },
  { field: "isUnread", label: "Unread", placeholder: "", type: "boolean" },
];

export type MailSearchTextField = "from" | "to" | "subject" | "body" | "before" | "after";

export const MAIL_SEARCH_TEXT_FIELDS: readonly MailSearchTextField[] = [
  "from",
  "to",
  "subject",
  "body",
  "after",
  "before",
];

/** Appends `*` to each word so Stalwart FTS prefix-matches tokens ("hi me" matches "hi me!"). */
export function toJmapTextQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.endsWith("*") || word.endsWith('"') ? word : `${word}*`,
    )
    .join(" ");
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidSearchDate(value: string): boolean {
  return toJmapUtcDate(value) !== null;
}

/** JMAP `before`/`after` need a UTCDate; a bare day means the start of that day in the user's timezone. */
export function toJmapUtcDate(
  value: string,
  timezone?: string | null,
): string | null {
  const trimmed = value.trim();
  const match = DATE_ONLY_PATTERN.exec(trimmed);
  let instant: Date;
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const calendarDay = new Date(year, month - 1, day);
    if (
      calendarDay.getFullYear() !== year ||
      calendarDay.getMonth() !== month - 1 ||
      calendarDay.getDate() !== day
    ) {
      return null;
    }
    instant = getZonedDayUtcBounds(calendarDay, resolveTimezone(timezone)).start;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return null;
    instant = new Date(trimmed);
  }
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function conditionToChip(
  condition: MailSearchFilterCondition,
): MailSearchChip[] {
  const chips: MailSearchChip[] = [];

  if (condition.from) {
    chips.push({ field: "from", value: condition.from, label: `from:${condition.from}` });
  }
  if (condition.to) {
    chips.push({ field: "to", value: condition.to, label: `to:${condition.to}` });
  }
  if (condition.subject) {
    chips.push({ field: "subject", value: condition.subject, label: `subject:${condition.subject}` });
  }
  if (condition.body) {
    chips.push({ field: "body", value: condition.body, label: `body:${condition.body}` });
  }
  if (condition.hasAttachment) {
    chips.push({ field: "hasAttachment", value: true, label: "has:attachment" });
  }
  if (condition.before) {
    chips.push({ field: "before", value: condition.before, label: `before:${condition.before}` });
  }
  if (condition.after) {
    chips.push({ field: "after", value: condition.after, label: `after:${condition.after}` });
  }
  if (condition.isFlagged) {
    chips.push({ field: "isFlagged", value: true, label: "is:starred" });
  }
  if (condition.isUnread) {
    chips.push({ field: "isUnread", value: true, label: "is:unread" });
  }

  return chips;
}

export function filtersToChips(filters: MailSearchFilters): MailSearchChip[] {
  const chips: MailSearchChip[] = [];
  if (filters.text) {
    chips.push({ field: "subject", value: filters.text, label: filters.text });
  }
  for (const condition of filters.conditions) {
    chips.push(...conditionToChip(condition));
  }
  return chips;
}

function conditionToJmapFragment(
  condition: MailSearchFilterCondition,
  timezone: string | null | undefined,
): Record<string, unknown> {
  const fragment: Record<string, unknown> = {};

  if (condition.from?.trim()) fragment.from = condition.from.trim();
  if (condition.to?.trim()) fragment.to = condition.to.trim();
  if (condition.subject?.trim()) fragment.subject = condition.subject.trim();
  if (condition.body?.trim()) fragment.body = condition.body.trim();
  if (condition.hasAttachment) fragment.hasAttachment = true;
  const before = condition.before ? toJmapUtcDate(condition.before, timezone) : null;
  if (before) fragment.before = before;
  const after = condition.after ? toJmapUtcDate(condition.after, timezone) : null;
  if (after) fragment.after = after;
  if (condition.isFlagged) fragment.hasKeyword = "$flagged";
  if (condition.isUnread) fragment.notKeyword = "$seen";

  return fragment;
}

/** Builds a JMAP Email/query FilterCondition (or AND operator) scoped to one mailbox. */
export function buildJmapFilter(
  mailboxId: string,
  filters: MailSearchFilters,
  options: { timezone?: string | null } = {},
): Record<string, unknown> {
  const base: Record<string, unknown> = { inMailbox: mailboxId };
  const text = filters.text?.trim();
  if (text) {
    base.text = toJmapTextQuery(text);
  }

  const conditionFragments = filters.conditions
    .map((condition) => conditionToJmapFragment(condition, options.timezone))
    .filter((fragment) => Object.keys(fragment).length > 0);

  if (conditionFragments.length === 0) {
    return base;
  }

  if (conditionFragments.length === 1) {
    return { ...base, ...conditionFragments[0] };
  }

  const andConditions: Record<string, unknown>[] = [];
  if (text) {
    andConditions.push({ inMailbox: mailboxId, text: toJmapTextQuery(text) });
  }
  for (const fragment of conditionFragments) {
    andConditions.push({ inMailbox: mailboxId, ...fragment });
  }

  return {
    operator: "AND",
    conditions: andConditions,
  };
}

export function hasActiveFilters(filters: MailSearchFilters): boolean {
  return Boolean(
    filters.text?.trim() ||
      filters.conditions.some((c) =>
        Object.values(c).some((v) => v !== undefined && v !== false && v !== ""),
      ),
  );
}

export type MailSearchFieldValues = Partial<Record<MailSearchTextField, string>>;

/** True when a server-side field (sender, recipient, subject, body, or date) needs a JMAP query. */
export function hasMailSearchFieldValues(fields: MailSearchFieldValues): boolean {
  return MAIL_SEARCH_TEXT_FIELDS.some((field) => {
    const value = fields[field]?.trim();
    if (!value) return false;
    return field === "before" || field === "after" ? isValidSearchDate(value) : true;
  });
}

export function countMailSearchFieldValues(fields: MailSearchFieldValues): number {
  return MAIL_SEARCH_TEXT_FIELDS.filter((field) => Boolean(fields[field]?.trim())).length;
}

/** Folds list-filter toggles into the field search so the JMAP query covers the whole mailbox. */
export function buildMailSearchFilters(
  fields: MailSearchFieldValues,
  listFilters: Pick<MailListFilters, "readState" | "starred" | "attachments">,
): MailSearchFilters {
  const condition: MailSearchFilterCondition = {};
  for (const field of MAIL_SEARCH_TEXT_FIELDS) {
    const value = fields[field]?.trim();
    if (value) condition[field] = value;
  }
  if (listFilters.starred) condition.isFlagged = true;
  if (listFilters.attachments) condition.hasAttachment = true;
  if (listFilters.readState === "unread") condition.isUnread = true;
  return { conditions: [condition] };
}

export function buildMailboxFieldSearchFilter(
  mailboxId: string,
  fields: MailSearchFieldValues,
  filters: MailListFilters,
  options: { now: Date; timezone?: string | null },
): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [buildJmapFilter(mailboxId, buildMailSearchFilters(fields, filters), options)];
  if (filters.readState === "read") conditions.push({ hasKeyword: "$seen" });
  const cutoff = getMailListAgeCutoff(filters.age, options.now, resolveTimezone(options.timezone));
  if (cutoff) conditions.push({ [cutoff.before ? "before" : "after"]: new Date(cutoff.instant).toISOString() });
  if (filters.labelIds.length) conditions.push({
    operator: "OR", conditions: filters.labelIds.map((id) => ({ hasKeyword: `label:${id}` })),
  });
  return conditions.length === 1 ? conditions[0] ?? { inMailbox: mailboxId } : { operator: "AND", conditions };
}
