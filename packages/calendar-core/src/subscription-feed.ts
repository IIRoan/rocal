import type { CalendarSubscription } from "./types";

/** Its own root, so a subscriptions refresh never re-runs the sync. */
export const FEED_SYNC_QUERY_KEY = ["feed-sync"] as const;

export const FEED_SYNC_INTERVAL_MS = 15 * 60_000;

const SEALED_URL_PREFIX = "sealed:";

type FeedSyncFields = Pick<
  CalendarSubscription,
  "url" | "encryptedUrl" | "isActive" | "lastSyncAt" | "syncIntervalMinutes"
>;

/** The URL a sync request carries: only a sealed feed's, and only when it opened on this device. */
export function feedSyncUrl(
  subscription: Pick<CalendarSubscription, "url" | "encryptedUrl">,
): string | undefined {
  return subscription.encryptedUrl &&
    !subscription.url.startsWith(SEALED_URL_PREFIX)
    ? subscription.url
    : undefined;
}

/** Mirrors the server scheduler for sealed feeds, which it no longer syncs: active, and its own interval has passed. */
export function isFeedSyncDue(subscription: FeedSyncFields, now: number): boolean {
  if (!subscription.isActive || !feedSyncUrl(subscription)) return false;
  if (!subscription.lastSyncAt) return true;
  const last = new Date(subscription.lastSyncAt).getTime();
  return (
    Number.isNaN(last) ||
    now - last >= subscription.syncIntervalMinutes * 60_000
  );
}
