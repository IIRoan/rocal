import { normalizeEmailAddress } from "./mail-addresses";

export type RecentContactContext = "mail" | "calendar";

export type RecentContactEntry = {
  email: string;
  displayName?: string;
  lastUsedAt: string;
  useCount: number;
  contexts: RecentContactContext[];
};

export type RecentContactsPayload = {
  version: 1;
  contacts: RecentContactEntry[];
};

export type RecentContactUsageInput = {
  email: string;
  displayName?: string;
};

export const MAX_RECENT_CONTACTS = 150;

export const EMPTY_RECENT_CONTACTS_PAYLOAD: RecentContactsPayload = {
  version: 1,
  contacts: [],
};

export function createEmptyRecentContactsPayload(): RecentContactsPayload {
  return { version: 1, contacts: [] };
}

export function formatRecentContactForField(entry: RecentContactEntry): string {
  const name = entry.displayName?.trim();
  if (name && name.toLowerCase() !== entry.email) {
    return `${name} <${entry.email}>`;
  }
  return entry.email;
}

export function insertRecipientSuggestion(
  currentValue: string,
  suggestion: string,
  options?: { appendSeparator?: boolean },
): string {
  const separatorIndex = Math.max(
    currentValue.lastIndexOf(","),
    currentValue.lastIndexOf(";"),
  );
  const prefix =
    separatorIndex >= 0 ? `${currentValue.slice(0, separatorIndex + 1)} ` : "";
  const combined = prefix ? `${prefix}${suggestion}` : suggestion;
  return options?.appendSeparator ? `${combined}, ` : combined;
}

function normalizeUsageInput(
  input: RecentContactUsageInput,
): RecentContactUsageInput | null {
  const email = normalizeEmailAddress(input.email);
  if (!email) return null;

  const displayName = input.displayName?.trim();
  return displayName ? { email, displayName } : { email };
}

function mergeContactEntry(
  existing: RecentContactEntry | undefined,
  input: RecentContactUsageInput,
  context: RecentContactContext,
  usedAt: string,
): RecentContactEntry {
  const contexts = existing?.contexts ?? [];
  const nextContexts = contexts.includes(context)
    ? contexts
    : [...contexts, context];

  return {
    email: input.email,
    displayName: input.displayName ?? existing?.displayName,
    lastUsedAt: usedAt,
    useCount: (existing?.useCount ?? 0) + 1,
    contexts: nextContexts,
  };
}

export function recordRecentContactUsage(
  payload: RecentContactsPayload | null | undefined,
  entries: RecentContactUsageInput[],
  context: RecentContactContext,
  options?: { usedAt?: string },
): RecentContactsPayload {
  const usedAt = options?.usedAt ?? new Date().toISOString();
  const base = payload ?? createEmptyRecentContactsPayload();
  const byEmail = new Map(
    base.contacts.map((contact) => [contact.email, contact]),
  );

  for (const raw of entries) {
    const input = normalizeUsageInput(raw);
    if (!input) continue;

    const existing = byEmail.get(input.email);
    byEmail.set(
      input.email,
      mergeContactEntry(existing, input, context, usedAt),
    );
  }

  const contacts = [...byEmail.values()].sort((a, b) =>
    b.lastUsedAt.localeCompare(a.lastUsedAt),
  );

  return {
    version: 1,
    contacts: contacts.slice(0, MAX_RECENT_CONTACTS),
  };
}

export type FilterRecentContactSuggestionsOptions = {
  query?: string;
  excludeEmails?: string[];
  limit?: number;
};

function matchesQuery(entry: RecentContactEntry, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  if (entry.email.startsWith(normalized)) return true;

  const displayName = entry.displayName?.trim().toLowerCase();
  return displayName ? displayName.startsWith(normalized) : false;
}

export function filterRecentContactSuggestions(
  payload: RecentContactsPayload | null | undefined,
  options: FilterRecentContactSuggestionsOptions = {},
): RecentContactEntry[] {
  if (!payload?.contacts.length) return [];

  const limit = options.limit ?? 8;
  const exclude = new Set(
    (options.excludeEmails ?? []).map((email) => normalizeEmailAddress(email)),
  );
  const query = options.query ?? "";

  return payload.contacts
    .filter((entry) => !exclude.has(entry.email))
    .filter((entry) => matchesQuery(entry, query))
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, limit);
}
