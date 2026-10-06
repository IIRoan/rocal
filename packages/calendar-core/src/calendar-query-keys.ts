/** TanStack Query keys shared by web and native for calendar metadata. */
export const CALENDARS_QUERY_KEY = ["calendars"] as const;
export const CATEGORIES_QUERY_KEY = ["categories"] as const;
export const EVENTS_QUERY_KEY = ["events"] as const;
export const SETTINGS_QUERY_KEY = ["settings"] as const;
export const SUBSCRIPTIONS_QUERY_KEY = ["subscriptions"] as const;
export const INVITES_QUERY_KEY = ["invites"] as const;
export const AUTH_ACCOUNTS_QUERY_KEY = ["auth", "accounts"] as const;
export const authAccountsQueryKey = (userId: string | null) =>
  [...AUTH_ACCOUNTS_QUERY_KEY, userId] as const;
export const eventNotificationsQueryKey = (eventId: string) =>
  ["eventNotifications", eventId] as const;
