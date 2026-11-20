import { getMailListAgeCutoff, type MailListFilters } from "./mail-list-view-filter";
import { parseStalwartSizeBytes } from "./mail-server-limits";
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
  cc?: string;
  /** A negated plain word, matched against subject, sender, recipient and text. */
  text?: string;
  isRead?: boolean;
  /** Positive: the folder to search instead of the open one; negated: messages outside it. */
  inMailbox?: MailSearchNamedRef;
  label?: MailSearchNamedRef;
  minSize?: number;
  maxSize?: number;
  negated?: boolean;
};

export type MailSearchNamedRef = { id: string; name: string };

export type MailSearchFilters = {
  text?: string;
  conditions: MailSearchFilterCondition[];
};

export type MailSearchChip = {
  field: keyof MailSearchFilterCondition;
  value: string | boolean | number | MailSearchNamedRef;
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

/** Quotes a value the parser would split or read as an operator or negation; it drops quotes, so they go here too. */
export function formatSearchOperatorValue(value: string): string {
  const bare = value.replace(/"/g, "");
  return /[\s:]|^-/.test(bare) ? `"${bare}"` : bare;
}

const SIZE_SUFFIXES: [number, string][] = [
  [1_000_000_000, "G"],
  [1_000_000, "M"],
  [1_000, "K"],
];

/** `500K`, `10M` or plain bytes, in the same decimal units the size operators parse. */
export function formatSearchSize(bytes: number): string {
  for (const [unit, suffix] of SIZE_SUFFIXES) {
    if (bytes >= unit && bytes % unit === 0) return `${bytes / unit}${suffix}`;
  }
  return String(bytes);
}

/** Bytes for `500K`, `10M`, `1G`, `2MB` or plain bytes; `null` when it is not a size. */
export function parseSearchSize(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  return parseStalwartSizeBytes(/[kmg]$/.test(trimmed) ? `${trimmed}b` : trimmed);
}

function chip(
  condition: MailSearchFilterCondition,
  field: keyof MailSearchFilterCondition,
  value: MailSearchChip["value"],
  label: string,
): MailSearchChip {
  return { field, value, label: condition.negated ? `-${label}` : label };
}

export function conditionToChip(
  condition: MailSearchFilterCondition,
): MailSearchChip[] {
  const chips: MailSearchChip[] = [];
  const quoted = formatSearchOperatorValue;

  if (condition.from) {
    chips.push(chip(condition, "from", condition.from, `from:${quoted(condition.from)}`));
  }
  if (condition.to) {
    chips.push(chip(condition, "to", condition.to, `to:${quoted(condition.to)}`));
  }
  if (condition.cc) {
    chips.push(chip(condition, "cc", condition.cc, `cc:${quoted(condition.cc)}`));
  }
  if (condition.subject) {
    chips.push(chip(condition, "subject", condition.subject, `subject:${quoted(condition.subject)}`));
  }
  if (condition.body) {
    chips.push({ field: "body", value: condition.body, label: `body:${condition.body}` });
  }
  if (condition.text) {
    chips.push(chip(condition, "text", condition.text, quoted(condition.text)));
  }
  if (condition.hasAttachment) {
    chips.push(chip(condition, "hasAttachment", true, "has:attachment"));
  }
  if (condition.before) {
    chips.push(chip(condition, "before", condition.before, `before:${condition.before}`));
  }
  if (condition.after) {
    chips.push(chip(condition, "after", condition.after, `after:${condition.after}`));
  }
  if (condition.isFlagged) {
    chips.push(chip(condition, "isFlagged", true, "is:starred"));
  }
  if (condition.isUnread) {
    chips.push(chip(condition, "isUnread", true, "is:unread"));
  }
  if (condition.isRead) {
    chips.push(chip(condition, "isRead", true, "is:read"));
  }
  if (condition.inMailbox) {
    chips.push(chip(condition, "inMailbox", condition.inMailbox, `in:${quoted(condition.inMailbox.name)}`));
  }
  if (condition.label) {
    chips.push(chip(condition, "label", condition.label, `label:${quoted(condition.label.name)}`));
  }
  if (condition.minSize !== undefined) {
    chips.push(chip(condition, "minSize", condition.minSize, `larger:${formatSearchSize(condition.minSize)}`));
  }
  if (condition.maxSize !== undefined) {
    chips.push(chip(condition, "maxSize", condition.maxSize, `smaller:${formatSearchSize(condition.maxSize)}`));
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
  if (condition.cc?.trim()) fragment.cc = condition.cc.trim();
  if (condition.text?.trim()) fragment.text = toJmapTextQuery(condition.text);
  if (condition.isRead) fragment.hasKeyword = "$seen";
  if (condition.label) fragment.hasKeyword = `label:${condition.label.id}`;
  if (condition.minSize !== undefined) fragment.minSize = condition.minSize;
  if (condition.maxSize !== undefined) fragment.maxSize = condition.maxSize;
  // A positive folder is the search scope (`resolveMailSearchScope`), not a filter.
  if (condition.inMailbox && condition.negated) fragment.inMailbox = condition.inMailbox.id;

  if (!condition.negated || Object.keys(fragment).length === 0) return fragment;
  return { operator: "NOT", conditions: [fragment] };
}

/** The folder a search runs in: the first typed `in:` folder, else the open one. */
export function resolveMailSearchScope(
  currentMailboxId: string,
  filters: MailSearchFilters | null | undefined,
): string {
  const scoped = filters?.conditions.find(
    (condition) => condition.inMailbox && !condition.negated,
  );
  return scoped?.inMailbox?.id ?? currentMailboxId;
}

function isNegatedFragment(fragment: Record<string, unknown>): boolean {
  return fragment.operator === "NOT";
}

/** Builds a JMAP Email/query FilterCondition (or AND operator) scoped to one mailbox, or to a typed `in:` folder. */
export function buildJmapFilter(
  currentMailboxId: string,
  filters: MailSearchFilters,
  options: { timezone?: string | null } = {},
): Record<string, unknown> {
  const fragments = filters.conditions
    .map((condition) => conditionToJmapFragment(condition, options.timezone))
    .filter((fragment) => Object.keys(fragment).length > 0);
  const negated = fragments.filter(isNegatedFragment);
  const filter = buildPositiveJmapFilter(
    resolveMailSearchScope(currentMailboxId, filters),
    filters.text?.trim(),
    fragments.filter((fragment) => !isNegatedFragment(fragment)),
  );
  return negated.length === 0 ? filter : { operator: "AND", conditions: [filter, ...negated] };
}

function buildPositiveJmapFilter(
  mailboxId: string,
  text: string | undefined,
  conditionFragments: Record<string, unknown>[],
): Record<string, unknown> {
  const base: Record<string, unknown> = { inMailbox: mailboxId };
  if (text) {
    base.text = toJmapTextQuery(text);
  }

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
