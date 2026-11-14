import {
  conditionToChip,
  formatSearchOperatorValue,
  isValidSearchDate,
  parseSearchSize,
  type MailSearchFilterCondition,
  type MailSearchFilters,
  type MailSearchNamedRef,
} from "./mail-search-filter";
import {
  MAIL_SEARCH_OPERATOR_KEYS,
  NEGATED_TEXT_KEY,
  parseSearchQuery,
  type SearchQueryOperator,
} from "./search-query";

export type MailSearchContext = {
  mailboxes: readonly { id: string; name?: string | null; role?: string | null }[];
  labels: readonly { id: string; name: string }[];
};

export type ParsedMailSearch = {
  /** Plain words, searched as text. */
  text: string;
  filters: MailSearchFilters;
  /** Operators that could not be used, kept as typed so the user can fix them; never searched. */
  unresolved: string;
  issues: string[];
};

const DATE_ISSUE = "Use dates like 2026-11-14.";
const SIZE_ISSUE = "Use sizes like 500K or 10M.";
const ROLE_ALIASES: Record<string, readonly string[]> = {
  spam: ["junk", "spam"],
  junk: ["junk", "spam"],
};

const IS_VALUES: Record<string, MailSearchFilterCondition> = {
  unread: { isUnread: true },
  read: { isRead: true },
  starred: { isFlagged: true },
  flagged: { isFlagged: true },
};

function findMailbox(value: string, context: MailSearchContext): MailSearchNamedRef | null {
  const wanted = value.toLowerCase();
  const roles = ROLE_ALIASES[wanted] ?? [wanted];
  const mailbox =
    context.mailboxes.find((entry) => roles.includes(entry.role?.toLowerCase() ?? "")) ??
    context.mailboxes.find((entry) => entry.name?.toLowerCase() === wanted);
  return mailbox ? { id: mailbox.id, name: value } : null;
}

function findLabel(value: string, context: MailSearchContext): MailSearchNamedRef | null {
  const wanted = value.toLowerCase();
  const label = context.labels.find((entry) => entry.name.toLowerCase() === wanted);
  return label ? { id: label.id, name: value } : null;
}

/** One operator as one condition, or the reason it cannot be searched; names resolve on this device only. */
function operatorToCondition(
  operator: SearchQueryOperator,
  context: MailSearchContext,
): MailSearchFilterCondition | string {
  const { key, value } = operator;
  switch (key) {
    case "from":
      return { from: value };
    case "to":
      return { to: value };
    case "cc":
      return { cc: value };
    case "subject":
      return { subject: value };
    case NEGATED_TEXT_KEY:
      return { text: value };
    case "before":
      return isValidSearchDate(value) ? { before: value } : DATE_ISSUE;
    case "after":
      return isValidSearchDate(value) ? { after: value } : DATE_ISSUE;
    case "has":
      return value.toLowerCase() === "attachment" ? { hasAttachment: true } : "Use has:attachment.";
    case "is":
      return IS_VALUES[value.toLowerCase()] ?? "Use is:read, is:unread or is:starred.";
    case "in": {
      const mailbox = findMailbox(value, context);
      return mailbox ? { inMailbox: mailbox } : `No folder named “${value}”.`;
    }
    case "label": {
      const label = findLabel(value, context);
      return label ? { label } : `No label named “${value}”.`;
    }
    case "larger":
    case "smaller": {
      const bytes = parseSearchSize(value);
      if (bytes === null) return SIZE_ISSUE;
      return key === "larger" ? { minSize: bytes } : { maxSize: bytes };
    }
    default:
      return `Unknown search operator “${key}”.`;
  }
}

function formatOperator(operator: SearchQueryOperator): string {
  const value = formatSearchOperatorValue(operator.value);
  const body = operator.key === NEGATED_TEXT_KEY ? value : `${operator.key}:${value}`;
  return operator.negated ? `-${body}` : body;
}

/** Splits typed mail search into words, operator conditions and issues; unusable operators are never sent as text. */
export function parseMailSearchQuery(input: string, context: MailSearchContext): ParsedMailSearch {
  const parsed = parseSearchQuery(input, MAIL_SEARCH_OPERATOR_KEYS);
  const conditions: MailSearchFilterCondition[] = [];
  const unresolved: string[] = [];
  const issues: string[] = [];
  for (const operator of parsed.operators) {
    const condition = operatorToCondition(operator, context);
    if (typeof condition === "string") {
      unresolved.push(formatOperator(operator));
      if (!issues.includes(condition)) issues.push(condition);
      continue;
    }
    conditions.push(operator.negated ? { ...condition, negated: true } : condition);
  }
  return {
    text: parsed.terms.join(" "),
    filters: mergeMailSearchFilters({ conditions: [] }, { conditions }),
    unresolved: unresolved.join(" "),
    issues,
  };
}

export function hasMailSearchConditions(parsed: ParsedMailSearch): boolean {
  return parsed.filters.conditions.length > 0;
}

/** Joins two searches, dropping repeated conditions. */
export function mergeMailSearchFilters(a: MailSearchFilters, b: MailSearchFilters): MailSearchFilters {
  const text = [a.text?.trim(), b.text?.trim()].filter(Boolean).join(" ");
  const seen = new Set<string>();
  const conditions = [...a.conditions, ...b.conditions].filter((condition) => {
    const key = JSON.stringify(condition);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...(text ? { text } : {}), conditions };
}

/** Typed words and conditions back as one query string. */
export function formatMailSearchQuery(text: string, conditions: MailSearchFilterCondition[]): string {
  return [text.trim(), ...conditions.flatMap(conditionToChip).map((chip) => chip.label)]
    .filter(Boolean)
    .join(" ");
}

/** On Enter, recognized operators become chips beside `current`; words and unusable operators stay in the box. */
export function liftMailSearchOperators(
  input: string,
  current: MailSearchFilters,
  context: MailSearchContext,
): { text: string; filters: MailSearchFilters } {
  const parsed = parseMailSearchQuery(input, context);
  return {
    text: [parsed.text, parsed.unresolved].filter(Boolean).join(" "),
    filters: mergeMailSearchFilters(current, parsed.filters),
  };
}
