import { RateLimitError } from "./errors";

type RateLimitEntry = { count: number; resetTime: number };

const rateLimitStores = new Map<string, Map<string, RateLimitEntry>>();
const lastCleanupByStore = new Map<string, number>();

function getStore(storeId: string): Map<string, RateLimitEntry> {
  let store = rateLimitStores.get(storeId);
  if (!store) {
    store = new Map();
    rateLimitStores.set(storeId, store);
  }
  return store;
}

export type RateLimitConfig = {
  requests: number;
  windowMs: number;
};

export function enforceRateLimit(input: {
  storeId: string;
  key: string;
  limit: RateLimitConfig;
}): void {
  const now = Date.now();
  const store = getStore(input.storeId);
  const windowStart = now - input.limit.windowMs;
  const lastCleanup = lastCleanupByStore.get(input.storeId) ?? 0;

  if (now - lastCleanup > input.limit.windowMs) {
    for (const [storedKey, value] of store.entries()) {
      if (value.resetTime < now) {
        store.delete(storedKey);
      }
    }
    lastCleanupByStore.set(input.storeId, now);
  }

  const current = store.get(input.key);
  if (!current || current.resetTime < windowStart) {
    store.set(input.key, { count: 1, resetTime: now + input.limit.windowMs });
    return;
  }

  if (current.count >= input.limit.requests) {
    const retryAfterSeconds = Math.ceil((current.resetTime - now) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      retryAfterSeconds,
    );
  }

  current.count += 1;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  return "unknown";
}
