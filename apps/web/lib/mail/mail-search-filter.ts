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

export const SEARCH_FILTER_FIELDS: {
  field: keyof MailSearchFilterCondition;
  label: string;
  placeholder: string;
  type: "text" | "date" | "boolean";
}[] = [
  {
    field: "from",
    label: "From",
    placeholder: "sender@example.com",
    type: "text",
  },
  {
    field: "to",
    label: "To",
    placeholder: "recipient@example.com",
    type: "text",
  },
  {
    field: "subject",
    label: "Subject",
    placeholder: "Subject contains…",
    type: "text",
  },
  {
    field: "body",
    label: "Body",
    placeholder: "Body contains…",
    type: "text",
  },
  {
    field: "hasAttachment",
    label: "Has attachment",
    placeholder: "",
    type: "boolean",
  },
  {
    field: "before",
    label: "Before",
    placeholder: "YYYY-MM-DD",
    type: "date",
  },
  {
    field: "after",
    label: "After",
    placeholder: "YYYY-MM-DD",
    type: "date",
  },
  {
    field: "isFlagged",
    label: "Starred",
    placeholder: "",
    type: "boolean",
  },
  {
    field: "isUnread",
    label: "Unread",
    placeholder: "",
    type: "boolean",
  },
];

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
): Record<string, unknown> {
  const fragment: Record<string, unknown> = {};

  if (condition.from) fragment.from = condition.from;
  if (condition.to) fragment.to = condition.to;
  if (condition.subject) fragment.subject = condition.subject;
  if (condition.body) fragment.body = condition.body;
  if (condition.hasAttachment) fragment.hasAttachment = true;
  if (condition.before) fragment.before = condition.before;
  if (condition.after) fragment.after = condition.after;
  if (condition.isFlagged) {
    fragment.hasKeyword = "$flagged";
  }
  if (condition.isUnread) {
    fragment.notKeyword = "$seen";
  }

  return fragment;
}

export function buildJmapFilter(
  mailboxId: string,
  filters: MailSearchFilters,
): Record<string, unknown> {
  const base: Record<string, unknown> = { inMailbox: mailboxId };
  const text = filters.text?.trim();
  if (text) {
    base.text = text;
  }

  const conditionFragments = filters.conditions
    .map(conditionToJmapFragment)
    .filter((fragment) => Object.keys(fragment).length > 0);

  if (conditionFragments.length === 0) {
    return base;
  }

  if (conditionFragments.length === 1) {
    return { ...base, ...conditionFragments[0] };
  }

  const andConditions: Record<string, unknown>[] = [];
  if (text) {
    andConditions.push({ inMailbox: mailboxId, text });
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
