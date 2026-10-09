import { SETTINGS_QUERY_KEY } from "@workspace/calendar-core";

/** TanStack Query keys for web-only domains; cross-platform keys live in @workspace/calendar-core and mail keys in ./mail/mail-query-keys. */
export const webQueryKeys = {
  authStatus: (userId: string | null, sessionId: string | null) => ["auth-status", userId, sessionId] as const,
  settings: (userId: string | null) => [...SETTINGS_QUERY_KEY, userId] as const,
  passkeys: () => ["passkeys"] as const,
  eventDetail: (eventId: string | null) =>
    ["events", "detail", eventId] as const,
  eventSearch: (query: string) => ["events", "search", query] as const,
  unifiedSearchCalendar: (query: string, limit: number) =>
    ["unified-search", "calendar", query, limit] as const,
  unifiedSearchMailCorpus: () => ["unified-search", "mail-corpus"] as const,
} as const;
