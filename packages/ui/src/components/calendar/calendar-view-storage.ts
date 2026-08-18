import { CALENDAR_VIEWS, type CalendarView } from "./types";

export const CALENDAR_VIEW_STORAGE_KEY = "calendar-view-selection:v1";
const LEGACY_CALENDAR_VIEW_STORAGE_KEY = "calendar-view-selection";

type StoredCalendarView = {
  view: CalendarView;
  expires: number;
};

const listeners = new Set<() => void>();
let memoryView: CalendarView | null = null;

function canUseSessionStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

function isCalendarView(value: unknown): value is CalendarView {
  return (
    typeof value === "string" &&
    (CALENDAR_VIEWS as readonly string[]).includes(value)
  );
}

function parseStoredCalendarView(raw: string | null): CalendarView | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredCalendarView>;
    if (
      isCalendarView(parsed.view) &&
      typeof parsed.expires === "number" &&
      parsed.expires > Date.now()
    ) {
      return parsed.view;
    }
  } catch {
    if (isCalendarView(raw)) {
      return raw;
    }
  }

  return null;
}

function notifyStoredCalendarViewListeners() {
  listeners.forEach((listener) => listener());
}

export function subscribeStoredCalendarView(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getStoredCalendarViewSnapshot(
  fallback: CalendarView = "month",
): CalendarView {
  return readStoredCalendarView() ?? memoryView ?? fallback;
}

export function getStoredCalendarViewServerSnapshot(
  fallback: CalendarView = "month",
): CalendarView {
  return fallback;
}

export function readStoredCalendarView(): CalendarView | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  const stored = parseStoredCalendarView(
    sessionStorage.getItem(CALENDAR_VIEW_STORAGE_KEY),
  );
  if (stored) {
    memoryView = stored;
    return stored;
  }

  const legacy = parseStoredCalendarView(
    sessionStorage.getItem(LEGACY_CALENDAR_VIEW_STORAGE_KEY),
  );
  if (legacy) {
    writeStoredCalendarView(legacy);
    sessionStorage.removeItem(LEGACY_CALENDAR_VIEW_STORAGE_KEY);
    return legacy;
  }

  sessionStorage.removeItem(CALENDAR_VIEW_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_CALENDAR_VIEW_STORAGE_KEY);
  return null;
}

export function writeStoredCalendarView(view: CalendarView): void {
  memoryView = view;

  if (canUseSessionStorage()) {
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + 1);
    sessionStorage.setItem(
      CALENDAR_VIEW_STORAGE_KEY,
      JSON.stringify({
        view,
        expires: expirationTime.getTime(),
      } satisfies StoredCalendarView),
    );
    sessionStorage.removeItem(LEGACY_CALENDAR_VIEW_STORAGE_KEY);
  }

  notifyStoredCalendarViewListeners();
}
