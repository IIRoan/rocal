import {
  CALENDARS_QUERY_KEY,
  CATEGORIES_QUERY_KEY,
  PUSH_DEVICES_QUERY_KEY,
  eventNotificationsQueryKey,
} from "@workspace/calendar-core";

export const QUERY_KEYS = {
  eventsRoot: () => ["events"] as const,
  events: (start: string, end: string) => ["events", start, end] as const,
  calendars: () => CALENDARS_QUERY_KEY,
  categories: () => CATEGORIES_QUERY_KEY,
  settings: () => ["settings"] as const,
  subscriptions: () => ["subscriptions"] as const,
  eventDetail: (id: string) => ["event", id] as const,
  searchResults: (query: string) => ["search", query] as const,
  eventNotifications: (eventId: string) => eventNotificationsQueryKey(eventId),
  calendarShareLink: (calendarId: string) =>
    ["calendarShareLink", calendarId] as const,
  mailConfig: () => ["mail", "config"] as const,
  mailAccount: () => ["mail", "account"] as const,
  mailRuntime: () => ["mail", "runtime"] as const,
  mailMessagesAll: () => ["mail", "messages"] as const,
  mailMessages: (mailboxId: string | null) =>
    ["mail", "messages", mailboxId] as const,
  mailMessage: (messageId: string) => ["mail", "message", messageId] as const,
  mailDecrypted: (messageId: string) =>
    ["mail", "decrypted", "v2", messageId] as const,
  mailLabels: () => ["mail", "labels"] as const,
  mailThread: (threadId: string | null) => ["mail", "thread", threadId] as const,
  invites: () => ["invites"] as const,
  pushDevices: () => PUSH_DEVICES_QUERY_KEY,
  hiddenMailboxIds: () => ["mail", "hiddenMailboxIds"] as const,
  mailDisplaySettings: () => ["mail", "displaySettings"] as const,
  mailComposeSettings: () => ["mail", "composeSettings"] as const,
  mailListSettings: () => ["mail", "listSettings"] as const,
  mailSearchMessages: (mailboxId: string | null, revision: number) =>
    ["mail", "messages", mailboxId, "search", revision] as const,
  signupConfig: () => ["account", "signupConfig"] as const,
  inviteValidation: (token: string) => ["inviteValidation", token] as const,
  paletteEventSearch: (query: string) =>
    ["command-palette-search", "events", query] as const,
  paletteMailSearch: (mailboxId: string | null, query: string) =>
    ["command-palette-search", "mail", mailboxId, query] as const,
} as const;
