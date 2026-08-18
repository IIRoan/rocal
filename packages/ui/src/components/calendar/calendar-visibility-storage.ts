import { createLogger } from "@workspace/logger";

const log = createLogger("calendar-visibility-storage");

export const CALENDAR_VISIBILITY_STORAGE_KEY = "rocani-calendar-visibility:v1";
const LEGACY_CALENDAR_VISIBILITY_STORAGE_KEY = "rocani-calendar-visibility";

export const EMPTY_CALENDAR_VISIBILITY: Record<string, boolean> = {};

const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: Record<string, boolean> = EMPTY_CALENDAR_VISIBILITY;
let hasReadStore = false;

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function parseVisibility(raw: string | null): Record<string, boolean> {
  if (!raw) {
    return EMPTY_CALENDAR_VISIBILITY;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return EMPTY_CALENDAR_VISIBILITY;
    }

    const next: Record<string, boolean> = {};
    for (const [id, visible] of Object.entries(parsed)) {
      if (typeof visible === "boolean") {
        next[id] = visible;
      }
    }

    return Object.keys(next).length === 0 ? EMPTY_CALENDAR_VISIBILITY : next;
  } catch (error) {
    log.warn("Failed to parse calendar visibility from localStorage:", error);
    return EMPTY_CALENDAR_VISIBILITY;
  }
}

function notifyCalendarVisibilityListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeCalendarVisibility(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getCalendarVisibilityServerSnapshot(): Record<string, boolean> {
  return EMPTY_CALENDAR_VISIBILITY;
}

export function getCalendarVisibilitySnapshot(): Record<string, boolean> {
  if (!canUseLocalStorage()) {
    return EMPTY_CALENDAR_VISIBILITY;
  }

  const versioned = localStorage.getItem(CALENDAR_VISIBILITY_STORAGE_KEY);
  if (versioned !== null) {
    if (hasReadStore && versioned === cacheRaw) {
      return cache;
    }
    hasReadStore = true;
    cacheRaw = versioned;
    cache = parseVisibility(versioned);
    return cache;
  }

  const legacy = localStorage.getItem(LEGACY_CALENDAR_VISIBILITY_STORAGE_KEY);
  if (legacy !== null) {
    writeCalendarVisibility(parseVisibility(legacy));
    return cache;
  }

  if (hasReadStore && cacheRaw === null) {
    return cache;
  }

  hasReadStore = true;
  cacheRaw = null;
  cache = EMPTY_CALENDAR_VISIBILITY;
  return cache;
}

export function writeCalendarVisibility(state: Record<string, boolean>): void {
  const next =
    Object.keys(state).length === 0 ? EMPTY_CALENDAR_VISIBILITY : state;
  const serialized = JSON.stringify(next);

  hasReadStore = true;
  cacheRaw = serialized;
  cache = next;

  if (canUseLocalStorage()) {
    try {
      localStorage.setItem(CALENDAR_VISIBILITY_STORAGE_KEY, serialized);
      localStorage.removeItem(LEGACY_CALENDAR_VISIBILITY_STORAGE_KEY);
    } catch (error) {
      log.warn("Failed to save calendar visibility to localStorage:", error);
    }
  }

  notifyCalendarVisibilityListeners();
}

export function patchCalendarVisibility(
  calendarId: string,
  visible: boolean,
): Record<string, boolean> {
  const next = {
    ...getCalendarVisibilitySnapshot(),
    [calendarId]: visible,
  };
  writeCalendarVisibility(next);
  return next;
}
