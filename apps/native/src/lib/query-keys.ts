/**
 * Centralised React Query cache key definitions.
 *
 * Using a constant map avoids typos and makes cache invalidation
 * predictable across the app.
 */
import { PUSH_DEVICES_QUERY_KEY } from "@workspace/calendar-core";

export const QUERY_KEYS = {
  events: (start: string, end: string) => ["events", start, end] as const,
  calendars: () => ["calendars"] as const,
  categories: () => ["categories"] as const,
  settings: () => ["settings"] as const,
  subscriptions: () => ["subscriptions"] as const,
  eventDetail: (id: string) => ["event", id] as const,
  searchResults: (query: string) => ["search", query] as const,
  notifications: (eventId: string) => ["notifications", eventId] as const,
  calendarShareLink: (calendarId: string) =>
    ["calendarShareLink", calendarId] as const,
  mailConfig: () => ["mail", "config"] as const,
  mailAccount: () => ["mail", "account"] as const,
  mailRuntime: () => ["mail", "runtime"] as const,
  mailMessages: (mailboxId: string | null) =>
    ["mail", "messages", mailboxId] as const,
  mailMessage: (messageId: string) => ["mail", "message", messageId] as const,
  mailDecrypted: (messageId: string) => ["mail", "decrypted", messageId] as const,
  mailLabels: () => ["mail", "labels"] as const,
  mailThread: (threadId: string | null) => ["mail", "thread", threadId] as const,
  invites: () => ["invites"] as const,
  pushDevices: () => PUSH_DEVICES_QUERY_KEY,
  hiddenMailboxIds: () => ["mail", "hiddenMailboxIds"] as const,
} as const;
