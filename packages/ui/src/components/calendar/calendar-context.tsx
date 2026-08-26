"use client";

import React, {
  createContext,
  use,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useSyncExternalStore,
  ReactNode,
} from "react";
import { createLogger } from "@workspace/logger";
import {
  Calendar,
  CreateCalendarData,
  CalendarView,
} from "./types";
import {
  getStoredCalendarViewServerSnapshot,
  getStoredCalendarViewSnapshot,
  subscribeStoredCalendarView,
  writeStoredCalendarView,
} from "./calendar-view-storage";
import {
  getCalendarVisibilityServerSnapshot,
  getCalendarVisibilitySnapshot,
  patchCalendarVisibility,
  subscribeCalendarVisibility,
} from "./calendar-visibility-storage";

const log = createLogger("calendar-context");
const EMPTY_CALENDARS: Calendar[] = [];
const PRERENDER_CALENDAR_DATE = new Date(0);
const subscribeNever = () => () => {};

interface CalendarContextType {
  // Date management
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  clearSavedDate: () => void; // Utility to clear localStorage date

  // View management
  currentView: CalendarView;
  setCurrentView: (view: CalendarView) => void;

  // Calendar management
  calendars: Calendar[];
  setCalendars: (calendars: Calendar[]) => void;
  addCalendar: (calendarData: CreateCalendarData) => Promise<void>;
  toggleCalendarVisibility: (calendarId: string) => Promise<void>;
  isCalendarVisible: (calendarId: string) => boolean;
  getVisibleCalendars: () => Calendar[];
  refreshCalendars: () => Promise<void>;

  // Legacy color visibility (for backward compatibility)
  visibleColors: string[];
  toggleColorVisibility: (color: string) => void;
  isColorVisible: (color: string | undefined) => boolean;
}

const CalendarContext = createContext<CalendarContextType | undefined>(
  undefined,
);

export function useCalendarContext() {
  const context = use(CalendarContext);
  if (context === undefined) {
    throw new Error(
      "useCalendarContext must be used within a CalendarProvider",
    );
  }
  return context;
}

interface CalendarProviderProps {
  children: ReactNode;
  defaultView?: CalendarView;
  initialCalendars?: Calendar[];
  onCreateCalendar?: (calendarData: CreateCalendarData) => Promise<Calendar>;
  onUpdateCalendar?: (
    id: string,
    updates: Partial<Calendar>,
  ) => Promise<Calendar>;
  onRefreshCalendars?: () => Promise<Calendar[]>;
}

function getBootstrapCalendarDate(): Date {
  if (typeof document !== "undefined") {
    const raw = document.documentElement.dataset.calendarBootstrapDate;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  if (typeof window !== "undefined") {
    const rawDate = new URLSearchParams(window.location.search).get("date");
    const match = rawDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      const parsed = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12,
        0,
        0,
        0,
      );

      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return new Date();
}

function getServerBootstrapCalendarDate(): Date {
  return PRERENDER_CALENDAR_DATE;
}

function useBootstrapCalendarDate(): Date {
  const clientDateRef = useRef<Date | null>(null);
  const getClientSnapshot = useCallback(() => {
    clientDateRef.current ??= getBootstrapCalendarDate();
    return clientDateRef.current;
  }, []);

  return useSyncExternalStore(
    subscribeNever,
    getClientSnapshot,
    getServerBootstrapCalendarDate,
  );
}

function calendarListKey(calendars: Calendar[]): string {
  return calendars
    .map(
      (calendar) =>
        `${calendar.id}:${calendar.name}:${calendar.color}:${calendar.kind}:${calendar.isVisible}:${calendar.isDefault}:${calendar.isPublic}:${calendar.isSyncOnly}`,
    )
    .join("|");
}

function validateCalendarDate(date: Date | string | null | undefined): Date {
  if (!date) {
    return new Date();
  }

  const dateObj = typeof date === "string" ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    log.warn("Invalid date provided, falling back to current date:", date);
    return new Date();
  }

  const now = new Date();
  const minDate = new Date(now.getFullYear() - 10, 0, 1);
  const maxDate = new Date(now.getFullYear() + 10, 11, 31);

  if (dateObj < minDate || dateObj > maxDate) {
    log.warn(
      "Date out of reasonable bounds, falling back to current date:",
      date,
    );
    return new Date();
  }

  const daysDiff =
    Math.abs(dateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 365 * 5) {
    log.warn("Date seems too far from current date, falling back:", date);
    return new Date();
  }

  return dateObj;
}

function useStoredCalendarView(defaultView: CalendarView) {
  const getViewSnapshot = useCallback(
    () => getStoredCalendarViewSnapshot(defaultView),
    [defaultView],
  );
  const getViewServerSnapshot = useCallback(
    () => getStoredCalendarViewServerSnapshot(defaultView),
    [defaultView],
  );
  const currentView = useSyncExternalStore(
    subscribeStoredCalendarView,
    getViewSnapshot,
    getViewServerSnapshot,
  );
  const setCurrentView = useCallback((view: CalendarView) => {
    writeStoredCalendarView(view);
  }, []);

  return { currentView, setCurrentView };
}

function useCalendarList(initialCalendars: Calendar[]) {
  const sourceKey = calendarListKey(initialCalendars);
  const [replacement, setReplacement] = useState<{
    calendars: Calendar[];
    sourceKey: string;
  } | null>(null);
  const [extrasById, setExtrasById] = useState<Record<string, Calendar>>({});

  const calendars = useMemo(() => {
    const base =
      replacement?.sourceKey === sourceKey
        ? replacement.calendars
        : initialCalendars;
    const byId = new Map(base.map((calendar) => [calendar.id, calendar]));
    for (const extra of Object.values(extrasById)) {
      if (!byId.has(extra.id)) {
        byId.set(extra.id, extra);
      }
    }
    return [...byId.values()];
  }, [extrasById, initialCalendars, replacement, sourceKey]);

  const setCalendars = useCallback(
    (next: Calendar[]) => {
      setReplacement({ calendars: next, sourceKey });
    },
    [sourceKey],
  );

  const addLocalCalendar = useCallback((calendar: Calendar) => {
    setExtrasById((prev) => ({ ...prev, [calendar.id]: calendar }));
  }, []);

  return { calendars, setCalendars, addLocalCalendar };
}

function resolveCalendarVisibility(
  calendarId: string,
  storedVisibility: Record<string, boolean>,
  calendars: Calendar[],
): boolean {
  const stored = storedVisibility[calendarId];
  if (stored !== undefined) {
    return stored;
  }

  return calendars.find((calendar) => calendar.id === calendarId)?.isVisible ?? true;
}

export function CalendarProvider({
  children,
  defaultView = "month",
  initialCalendars = EMPTY_CALENDARS,
  onCreateCalendar,
  onUpdateCalendar,
  onRefreshCalendars,
}: CalendarProviderProps) {
  const bootstrappedDate = useBootstrapCalendarDate();
  const [overrideDate, setOverrideDate] = useState<Date | null>(null);
  const currentDate = overrideDate ?? bootstrappedDate;

  const { currentView, setCurrentView } = useStoredCalendarView(defaultView);
  const { calendars, setCalendars, addLocalCalendar } =
    useCalendarList(initialCalendars);
  const storedVisibility = useSyncExternalStore(
    subscribeCalendarVisibility,
    getCalendarVisibilitySnapshot,
    getCalendarVisibilityServerSnapshot,
  );
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const syncTimeoutRef = useRef<{ id: ReturnType<typeof setTimeout> | null }>({
    id: null,
  });
  const visibleColors = useMemo(
    () =>
      calendars.flatMap((calendar) =>
        resolveCalendarVisibility(calendar.id, storedVisibility, calendars)
          ? [calendar.color]
          : [],
      ),
    [calendars, storedVisibility],
  );

  const syncPendingUpdates = useCallback(async () => {
    if (!onUpdateCalendar || pendingUpdatesRef.current.size === 0) return;

    const updates = Array.from(pendingUpdatesRef.current);
    pendingUpdatesRef.current.clear();
    const currentVisibility = getCalendarVisibilitySnapshot();
    const previousVisibilityByCalendarId = new Map(
      updates.map((calendarId) => [
        calendarId,
        calendars.find((calendar) => calendar.id === calendarId)?.isVisible,
      ]),
    );

    const results = await Promise.allSettled(
      updates.map(async (calendarId) => {
        const newVisibility = currentVisibility[calendarId];
        if (newVisibility === undefined) {
          return;
        }

        await onUpdateCalendar(calendarId, {
          isVisible: newVisibility,
        });
      }),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        return;
      }

      const calendarId = updates[index];
      if (!calendarId) {
        return;
      }

      const previousVisibility =
        previousVisibilityByCalendarId.get(calendarId) ?? true;

      patchCalendarVisibility(calendarId, previousVisibility);
      log.error(
        "Failed to sync calendar visibility update:",
        calendarId,
        result.reason,
      );
    });
  }, [calendars, onUpdateCalendar]);

  useEffect(() => {
    const timeout = syncTimeoutRef.current;
    return () => {
      if (timeout.id !== null) {
        clearTimeout(timeout.id);
      }
    };
  }, []);

  const addCalendar = useCallback(
    async (calendarData: CreateCalendarData) => {
      if (!onCreateCalendar) {
        return;
      }

      try {
        const newCalendar = await onCreateCalendar(calendarData);
        addLocalCalendar(newCalendar);
      } catch (error) {
        log.error("Failed to create calendar:", error);
        throw error;
      }
    },
    [addLocalCalendar, onCreateCalendar],
  );

  const toggleCalendarVisibility = useCallback(
    async (calendarId: string) => {
      const currentVisibility = resolveCalendarVisibility(
        calendarId,
        getCalendarVisibilitySnapshot(),
        calendars,
      );
      const newVisibility = !currentVisibility;

      patchCalendarVisibility(calendarId, newVisibility);
      pendingUpdatesRef.current.add(calendarId);

      if (syncTimeoutRef.current.id !== null) {
        clearTimeout(syncTimeoutRef.current.id);
      }

      syncTimeoutRef.current.id = setTimeout(() => {
        syncPendingUpdates();
      }, 500);
    },
    [calendars, syncPendingUpdates],
  );

  const refreshCalendars = useCallback(async () => {
    if (!onRefreshCalendars) {
      return;
    }

    try {
      setCalendars(await onRefreshCalendars());
    } catch (error) {
      log.error("Failed to refresh calendars:", error);
      throw error;
    }
  }, [onRefreshCalendars, setCalendars]);

  const isCalendarVisible = useCallback(
    (calendarId: string) =>
      resolveCalendarVisibility(calendarId, storedVisibility, calendars),
    [calendars, storedVisibility],
  );

  const getVisibleCalendars = useCallback(() => {
    return calendars.filter((calendar) =>
      resolveCalendarVisibility(calendar.id, storedVisibility, calendars),
    );
  }, [calendars, storedVisibility]);

  const toggleColorVisibility = useCallback((_color: string) => {}, []);

  const isColorVisible = useCallback(
    (color: string | undefined) => {
      if (!color) return true;
      return visibleColors.includes(color);
    },
    [visibleColors],
  );

  const setCurrentDateWithPersistence = useCallback((date: Date) => {
    setOverrideDate(validateCalendarDate(date));
  }, []);

  const clearSavedDate = useCallback(() => {
    setOverrideDate(new Date());
  }, []);

  const value = useMemo(
    () => ({
      currentDate,
      setCurrentDate: setCurrentDateWithPersistence,
      clearSavedDate,
      currentView,
      setCurrentView,
      calendars,
      setCalendars,
      addCalendar,
      toggleCalendarVisibility,
      isCalendarVisible,
      getVisibleCalendars,
      refreshCalendars,
      visibleColors,
      toggleColorVisibility,
      isColorVisible,
    }),
    [
      addCalendar,
      calendars,
      clearSavedDate,
      currentDate,
      currentView,
      getVisibleCalendars,
      isCalendarVisible,
      isColorVisible,
      refreshCalendars,
      setCalendars,
      setCurrentDateWithPersistence,
      setCurrentView,
      toggleCalendarVisibility,
      toggleColorVisibility,
      visibleColors,
    ],
  );

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}
