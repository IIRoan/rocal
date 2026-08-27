import {
  isAutomatedMailAddress,
  normalizeEmailAddress,
} from "./mail-addresses";

export type RecentContactContext = "mail" | "calendar";

export type RecentContactEntry = {
  email: string;
  displayName?: string;
  phone?: string;
  notes?: string;
  /** True when the user added or explicitly saved this contact. */
  manual?: boolean;
  lastUsedAt: string;
  useCount: number;
  contexts: RecentContactContext[];
};

export type ContactDetailsPatch = {
  displayName?: string;
  phone?: string;
  notes?: string;
};

export type ManualContactInput = {
  email: string;
  displayName?: string;
  phone?: string;
  notes?: string;
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
  if (!email || isAutomatedMailAddress(email)) return null;

  const displayName = input.displayName?.trim();
  return displayName ? { email, displayName } : { email };
}

function peopleContacts(contacts: RecentContactEntry[]): RecentContactEntry[] {
  return contacts.filter((entry) => !isAutomatedMailAddress(entry.email));
}

export function sanitizeRecentContactsPayload(
  payload: RecentContactsPayload,
): RecentContactsPayload {
  const contacts = peopleContacts(payload.contacts);
  if (contacts.length === payload.contacts.length) {
    return payload;
  }
  return { ...payload, contacts };
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
    phone: existing?.phone,
    notes: existing?.notes,
    manual: existing?.manual,
    lastUsedAt: usedAt,
    useCount: (existing?.useCount ?? 0) + 1,
    contexts: nextContexts,
  };
}

function trimOptionalField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function updateContactDetails(
  payload: RecentContactsPayload,
  email: string,
  patch: ContactDetailsPatch,
): RecentContactsPayload {
  const normalized = normalizeEmailAddress(email);
  if (!normalized) return payload;

  const index = payload.contacts.findIndex(
    (contact) => contact.email === normalized,
  );
  if (index < 0) return payload;

  const existing = payload.contacts[index];
  if (!existing) return payload;

  const nextEntry: RecentContactEntry = {
    ...existing,
    manual: true,
  };

  if (patch.displayName !== undefined) {
    nextEntry.displayName = trimOptionalField(patch.displayName);
  }
  if (patch.phone !== undefined) {
    nextEntry.phone = trimOptionalField(patch.phone);
  }
  if (patch.notes !== undefined) {
    nextEntry.notes = trimOptionalField(patch.notes);
  }

  const contacts = [...payload.contacts];
  contacts[index] = nextEntry;

  return { ...payload, contacts };
}

export function removeContact(
  payload: RecentContactsPayload,
  email: string,
): RecentContactsPayload {
  const normalized = normalizeEmailAddress(email);
  if (!normalized) return payload;

  return {
    ...payload,
    contacts: payload.contacts.filter((contact) => contact.email !== normalized),
  };
}

export function addManualContact(
  payload: RecentContactsPayload | null | undefined,
  input: ManualContactInput,
  options?: { addedAt?: string },
): RecentContactsPayload | null {
  const email = normalizeEmailAddress(input.email);
  if (!email || isAutomatedMailAddress(email)) return payload ?? null;

  const addedAt = options?.addedAt ?? new Date().toISOString();
  const base = payload ?? createEmptyRecentContactsPayload();
  const existing = base.contacts.find((contact) => contact.email === email);

  const entry: RecentContactEntry = {
    email,
    displayName:
      trimOptionalField(input.displayName) ?? existing?.displayName,
    phone: trimOptionalField(input.phone) ?? existing?.phone,
    notes: trimOptionalField(input.notes) ?? existing?.notes,
    manual: true,
    lastUsedAt: existing?.lastUsedAt ?? addedAt,
    useCount: existing?.useCount ?? 0,
    contexts: existing?.contexts ?? [],
  };

  const without = base.contacts.filter((contact) => contact.email !== email);
  const contacts = [entry, ...without].sort((a, b) =>
    b.lastUsedAt.localeCompare(a.lastUsedAt),
  );

  return {
    version: 1,
    contacts: contacts.slice(0, MAX_RECENT_CONTACTS),
  };
}

export type FilterContactsListOptions = {
  query?: string;
};

function contactMatchesListQuery(
  entry: RecentContactEntry,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  if (entry.email.includes(normalized)) return true;

  const displayName = entry.displayName?.trim().toLowerCase();
  if (displayName?.includes(normalized)) return true;

  const phone = entry.phone?.trim().toLowerCase();
  if (phone?.includes(normalized)) return true;

  const notes = entry.notes?.trim().toLowerCase();
  return notes ? notes.includes(normalized) : false;
}

export function filterContactsList(
  payload: RecentContactsPayload | null | undefined,
  options: FilterContactsListOptions = {},
): RecentContactEntry[] {
  if (!payload?.contacts.length) return [];

  return peopleContacts(payload.contacts)
    .filter((entry) => contactMatchesListQuery(entry, options.query ?? ""))
    .sort((a, b) => {
      const nameA = (a.displayName ?? a.email).toLowerCase();
      const nameB = (b.displayName ?? b.email).toLowerCase();
      const byName = nameA.localeCompare(nameB);
      if (byName !== 0) return byName;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    });
}

export function getContactDisplayLabel(entry: RecentContactEntry): string {
  return entry.displayName?.trim() || entry.email;
}

export function formatContactContextSummary(
  entry: RecentContactEntry,
): string | null {
  if (entry.contexts.length === 0) {
    return entry.manual ? "Added manually" : null;
  }

  const parts: string[] = [];
  if (entry.contexts.includes("mail")) parts.push("mail");
  if (entry.contexts.includes("calendar")) parts.push("calendar");
  if (parts.length === 0) return null;

  return `From ${parts.join(" & ")}`;
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

  const contacts = peopleContacts([...byEmail.values()]).sort((a, b) =>
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
  if (displayName?.startsWith(normalized)) return true;

  const phone = entry.phone?.trim().toLowerCase();
  return phone ? phone.startsWith(normalized) : false;
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

  return peopleContacts(payload.contacts)
    .filter((entry) => !exclude.has(entry.email))
    .filter((entry) => matchesQuery(entry, query))
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, limit);
}

/** Prefix matches first; substring search if nothing starts with the query. */
export function resolveRecipientSuggestions(
  payload: RecentContactsPayload | null | undefined,
  options: FilterRecentContactSuggestionsOptions = {},
): RecentContactEntry[] {
  const query = options.query?.trim() ?? "";
  const limit = options.limit ?? (query ? 8 : 12);
  const excludeEmails = options.excludeEmails;
  const prefixMatches = filterRecentContactSuggestions(payload, {
    query,
    excludeEmails,
    limit,
  });
  if (!query || prefixMatches.length > 0) {
    return prefixMatches;
  }

  const exclude = new Set(
    (excludeEmails ?? []).map((email) => normalizeEmailAddress(email)),
  );
  return filterContactsList(payload, { query })
    .filter((entry) => !exclude.has(entry.email))
    .slice(0, limit);
}
