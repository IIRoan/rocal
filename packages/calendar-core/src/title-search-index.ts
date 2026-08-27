import {
  normalizeSearchText,
  tokenizeSearchQuery,
} from "./mail-search-relevance";
import type { CalendarEvent } from "./types";
import type {
  UnifiedCalendarSearchResult,
  UnifiedMailSearchResult,
  UnifiedSearchEncryptionStatus,
  UnifiedSearchResult,
  UnifiedSearchSource,
} from "./search-types";

/** Matches the E2EE placeholder so locked ciphertext is never indexed as a title. */
export const LOCKED_EVENT_TITLE = "Encrypted event";

export type TitleIndexMailSource = {
  id: string;
  subject?: string | null;
  preview?: string | null;
  from?: Array<{ name?: string | null; email?: string | null }> | null;
  receivedAt?: string | null;
  threadId?: string | null;
  mailboxIds?: Record<string, boolean> | null;
};

export type TitleIndexDocument = {
  id: string;
  source: UnifiedSearchSource;
  title: string;
  subtitle?: string;
  timestamp?: string;
  eventId?: string;
  calendarId?: string;
  messageId?: string;
  threadId?: string;
  mailboxIds?: string[];
  from?: string;
  encryptionStatus: UnifiedSearchEncryptionStatus;
};

export type TitleIndexHit = {
  document: TitleIndexDocument;
  score: number;
  matchedFields: string[];
  snippet?: string;
};

export type TitleIndexShardPayload = {
  documents: TitleIndexDocument[];
  indexedAt: string;
};

const PREFIX_MATCH_WEIGHT = 0.75;

function formatMailFromLabel(
  from: TitleIndexMailSource["from"],
): string | undefined {
  const first = from?.[0];
  if (!first) return undefined;
  if (first.name && first.email) return `${first.name} <${first.email}>`;
  return first.name ?? first.email ?? undefined;
}

function toIsoTimestamp(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function calendarEncryptionStatus(
  event: CalendarEvent,
): UnifiedSearchEncryptionStatus {
  if (event.encryptionState === "encrypted") return "encrypted-indexed";
  if (event.encryptionState === "shadow_write") return "metadata-only";
  return "plaintext";
}

function tokenMatches(normalizedValue: string, token: string): boolean {
  return ` ${normalizedValue} `.includes(` ${token} `);
}

function prefixMatches(normalizedValue: string, token: string): boolean {
  return normalizedValue
    .split(" ")
    .some((word) => word.length > token.length && word.startsWith(token));
}

function scoreText(
  value: string,
  queryTokens: string[],
  phrase: string,
  weight: number,
): number {
  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) return 0;

  let exact = 0;
  let prefix = 0;
  for (const token of queryTokens) {
    if (tokenMatches(normalizedValue, token)) exact += 1;
    else if (prefixMatches(normalizedValue, token)) prefix += 1;
  }

  if (exact + prefix === 0) return 0;

  let score =
    exact * weight + prefix * weight * PREFIX_MATCH_WEIGHT;
  if (exact + prefix === queryTokens.length) score += weight;
  if (phrase && normalizedValue.includes(phrase)) score += weight * 2;
  if (phrase && normalizedValue === phrase) score += weight * 5;
  return score;
}

export function eventToTitleIndexDocument(
  event: CalendarEvent,
): TitleIndexDocument | null {
  const title = event.title?.trim() ?? "";
  if (!title || title === LOCKED_EVENT_TITLE) return null;

  return {
    id: `calendar:${event.id}`,
    source: "calendar",
    title,
    subtitle: event.location?.trim() || undefined,
    timestamp: toIsoTimestamp(event.start),
    eventId: event.id,
    calendarId: event.calendarId,
    encryptionStatus: calendarEncryptionStatus(event),
  };
}

export function mailToTitleIndexDocument(
  message: TitleIndexMailSource,
): TitleIndexDocument {
  const from = formatMailFromLabel(message.from);
  const title = message.subject?.trim() || "(no subject)";

  return {
    id: `mail:${message.id}`,
    source: "mail",
    title,
    subtitle: from ?? message.preview?.trim() ?? undefined,
    timestamp: message.receivedAt ?? undefined,
    messageId: message.id,
    threadId: message.threadId ?? undefined,
    mailboxIds: Object.keys(message.mailboxIds ?? {}),
    from,
    encryptionStatus: "plaintext",
  };
}

export function scoreTitleIndexDocument(
  document: TitleIndexDocument,
  query: string,
): TitleIndexHit | null {
  const queryTokens = tokenizeSearchQuery(query);
  if (queryTokens.length === 0) return null;

  const phrase = normalizeSearchText(query);
  const matchedFields: string[] = [];
  let score = 0;

  const titleScore = scoreText(document.title, queryTokens, phrase, 8);
  if (titleScore > 0) {
    matchedFields.push("title");
    score += titleScore;
  }

  if (document.subtitle) {
    const subtitleScore = scoreText(document.subtitle, queryTokens, phrase, 4);
    if (subtitleScore > 0) {
      matchedFields.push("subtitle");
      score += subtitleScore;
    }
  }

  if (document.from && document.from !== document.subtitle) {
    const fromScore = scoreText(document.from, queryTokens, phrase, 5);
    if (fromScore > 0) {
      matchedFields.push("from");
      score += fromScore;
    }
  }

  if (score <= 0) return null;

  return {
    document,
    score,
    matchedFields,
    snippet: document.subtitle,
  };
}

export function searchTitleIndex(
  documents: TitleIndexDocument[],
  query: string,
  limit: number,
): TitleIndexHit[] {
  const hits = documents.flatMap((document) => {
    const scored = scoreTitleIndexDocument(document, query);
    return scored ? [scored] : [];
  });

  return hits
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.document.timestamp ?? "").localeCompare(
        left.document.timestamp ?? "",
      );
    })
    .slice(0, Math.max(limit, 0));
}

function stubCalendarEvent(document: TitleIndexDocument): CalendarEvent {
  const start = document.timestamp
    ? new Date(document.timestamp)
    : new Date(0);
  return {
    id: document.eventId ?? document.id.replace(/^calendar:/, ""),
    title: document.title,
    location: document.subtitle ?? null,
    start,
    end: start,
    calendarId: document.calendarId ?? "",
    userId: "",
    createdAt: start,
    updatedAt: start,
    encryptionState:
      document.encryptionStatus === "encrypted-indexed"
        ? "encrypted"
        : document.encryptionStatus === "metadata-only"
          ? "shadow_write"
          : "plaintext",
  };
}

export function titleHitToUnifiedResult<TMessage = unknown>(
  hit: TitleIndexHit,
  messageFactory?: (document: TitleIndexDocument) => TMessage,
): UnifiedSearchResult<TMessage> {
  const { document, score, matchedFields, snippet } = hit;

  if (document.source === "calendar") {
    const event = stubCalendarEvent(document);
    const result: UnifiedCalendarSearchResult = {
      id: document.id,
      source: "calendar",
      eventId: event.id,
      title: document.title,
      snippet,
      timestamp: document.timestamp,
      score,
      encryptionStatus: document.encryptionStatus,
      matchedFields,
      event,
    };
    return result;
  }

  const messageId = document.messageId ?? document.id.replace(/^mail:/, "");
  const result: UnifiedMailSearchResult<TMessage> = {
    id: document.id,
    source: "mail",
    messageId,
    threadId: document.threadId,
    mailboxIds: document.mailboxIds,
    title: document.title,
    snippet,
    timestamp: document.timestamp,
    score,
    encryptionStatus: document.encryptionStatus,
    matchedFields,
    from: document.from,
    message: messageFactory
      ? messageFactory(document)
      : ({
          id: messageId,
          subject: document.title,
          threadId: document.threadId,
          receivedAt: document.timestamp,
          mailboxIds: Object.fromEntries(
            (document.mailboxIds ?? []).map((id) => [id, true]),
          ),
        } as TMessage),
  };
  return result;
}

export function mergeUnifiedSearchResults<TMessage = unknown>(
  groups: Array<Iterable<UnifiedSearchResult<TMessage>>>,
  limit: number,
): UnifiedSearchResult<TMessage>[] {
  const byId = new Map<string, UnifiedSearchResult<TMessage>>();

  for (const group of groups) {
    for (const result of group) {
      const existing = byId.get(result.id);
      if (!existing || result.score > existing.score) {
        byId.set(result.id, result);
      }
    }
  }

  return Array.from(byId.values())
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (right.timestamp ?? "").localeCompare(left.timestamp ?? "");
    })
    .slice(0, Math.max(limit, 0));
}
