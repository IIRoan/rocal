import type { CalendarEvent } from "./types";

export type UnifiedSearchSource = "calendar" | "mail";

export type UnifiedSearchEncryptionStatus =
  | "plaintext"
  | "encrypted-indexed"
  | "encrypted-locked"
  | "metadata-only"
  | "decrypt-failed";

export interface UnifiedSearchQuery {
  q: string;
  sources?: UnifiedSearchSource[];
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  calendarId?: string;
  mailboxId?: string;
  hasAttachment?: boolean;
  from?: string;
  to?: string;
}

export interface UnifiedSearchResultBase {
  id: string;
  source: UnifiedSearchSource;
  title: string;
  snippet?: string;
  timestamp?: string;
  score: number;
  encryptionStatus: UnifiedSearchEncryptionStatus;
  matchedFields: string[];
}

export interface UnifiedCalendarSearchResult extends UnifiedSearchResultBase {
  source: "calendar";
  eventId: string;
  event: CalendarEvent;
}

export interface UnifiedMailSearchResult<TMessage = unknown>
  extends UnifiedSearchResultBase {
  source: "mail";
  messageId: string;
  threadId?: string;
  mailboxIds?: string[];
  from?: string;
  message: TMessage;
}

export type UnifiedSearchResult<TMessage = unknown> =
  | UnifiedCalendarSearchResult
  | UnifiedMailSearchResult<TMessage>;

export interface UnifiedSearchResponse<TMessage = unknown> {
  results: UnifiedSearchResult<TMessage>[];
  total: number;
  sourceTotals: Partial<Record<UnifiedSearchSource, number>>;
  isIndexing?: boolean;
  isLimited?: boolean;
}
