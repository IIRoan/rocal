/**
 * Centralised React Query cache key definitions.
 *
 * Using a constant map avoids typos and makes cache invalidation
 * predictable across the app.
 */
export const QUERY_KEYS = {
  events: (start: string, end: string) => ["events", start, end] as const,
  calendars: () => ["calendars"] as const,
  categories: () => ["categories"] as const,
  settings: () => ["settings"] as const,
  subscriptions: () => ["subscriptions"] as const,
  eventDetail: (id: string) => ["event", id] as const,
  searchResults: (query: string) => ["search", query] as const,
  notifications: (eventId: string) => ["notifications", eventId] as const,
} as const;
