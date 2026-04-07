"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { Calendar, EventColor, CreateCalendarData, CalendarView } from "./types";

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
  const context = useContext(CalendarContext);
  if (context === undefined) {
    throw new Error(
      "useCalendarContext must be used within a CalendarProvider",
    );
  }
  return context;
}

interface CalendarProviderProps {
  children: ReactNode;
  initialCalendars?: Calendar[];
  onCreateCalendar?: (calendarData: CreateCalendarData) => Promise<Calendar>;
  onUpdateCalendar?: (
    id: string,
    updates: Partial<Calendar>,
  ) => Promise<Calendar>;
  onRefreshCalendars?: () => Promise<Calendar[]>;
}

export function CalendarProvider({
  children,
  initialCalendars = [],
  onCreateCalendar,
  onUpdateCalendar,
  onRefreshCalendars,
}: CalendarProviderProps) {
  // Helper function to validate and sanitize dates
  const validateDate = useCallback(
    (date: Date | string | null | undefined): Date => {
      if (!date) {
        return new Date();
      }

      const dateObj = typeof date === "string" ? new Date(date) : date;

      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        console.warn(
          "Invalid date provided, falling back to current date:",
          date,
        );
        return new Date();
      }

      // Check if date is within reasonable bounds (not too far in past/future)
      const now = new Date();
      const minDate = new Date(now.getFullYear() - 10, 0, 1); // 10 years ago (more restrictive)
      const maxDate = new Date(now.getFullYear() + 10, 11, 31); // 10 years from now (more restrictive)

      if (dateObj < minDate || dateObj > maxDate) {
        console.warn(
          "Date out of reasonable bounds, falling back to current date:",
          date,
        );
        return new Date();
      }

      // Additional check for problematic dates (like timezone edge cases)
      // If the date is more than 1 day different from what we expect, it might be problematic
      const timeDiff = Math.abs(dateObj.getTime() - now.getTime());
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      // If it's more than 5 years different, treat as suspicious
      if (daysDiff > 365 * 5) {
        console.warn(
          "Date seems too far from current date, falling back:",
          date,
        );
        return new Date();
      }

      return dateObj;
    },
    [],
  );

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [currentView, setCurrentViewState] = useState<CalendarView>("month");
  const setCurrentView = useCallback((view: CalendarView) => {
    setCurrentViewState(view);
  }, []);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const hasInitialized = useRef(false);

  // Performance optimization: Local visibility state with debounced sync and localStorage persistence
  const [localVisibilityState, setLocalVisibilityState] = useState<
    Record<string, boolean>
  >({});
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // localStorage key for calendar visibility state
  const VISIBILITY_STORAGE_KEY = "rocani-calendar-visibility";

  // Legacy color visibility for backward compatibility
  const [visibleColors, setVisibleColors] = useState<string[]>([]);

  // Load visibility state from localStorage
  const loadVisibilityFromStorage = (): Record<string, boolean> => {
    if (typeof window === "undefined") return {};

    try {
      const stored = localStorage.getItem(VISIBILITY_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.warn(
        "Failed to load calendar visibility from localStorage:",
        error,
      );
      return {};
    }
  };

  // Save visibility state to localStorage
  const saveVisibilityToStorage = (state: Record<string, boolean>) => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn(
        "Failed to save calendar visibility to localStorage:",
        error,
      );
    }
  };

  // Initialize calendars and local visibility state, and sync when calendars change
  useEffect(() => {
    if (initialCalendars.length > 0) {
      // Check if calendars have actually changed (by id and content)
      const hasChanges =
        calendars.length !== initialCalendars.length ||
        calendars.some((cal, i) => {
          const newCal = initialCalendars.find((c) => c.id === cal.id);
          return (
            !newCal ||
            newCal.name !== cal.name ||
            newCal.color !== cal.color ||
            newCal.isVisible !== cal.isVisible ||
            newCal.isDefault !== cal.isDefault
          );
        }) ||
        initialCalendars.some(
          (newCal) => !calendars.find((c) => c.id === newCal.id),
        );

      if (hasChanges || !hasInitialized.current) {
        setCalendars(initialCalendars);

        // Load visibility state from localStorage first
        const storedVisibility = loadVisibilityFromStorage();

        // Initialize local visibility state, prioritizing stored values but defaulting to server state
        const initialVisibility: Record<string, boolean> = {};
        initialCalendars.forEach((calendar) => {
          // Use stored value if available, otherwise use server state (defaults to true)
          initialVisibility[calendar.id] =
            storedVisibility[calendar.id] ?? calendar.isVisible;
        });
        setLocalVisibilityState(initialVisibility);

        // Clean up localStorage - remove visibility for deleted calendars
        const currentIds = new Set(initialCalendars.map((c) => c.id));
        const cleanedStoredVisibility: Record<string, boolean> = {};
        Object.entries(storedVisibility).forEach(([id, visible]) => {
          if (currentIds.has(id)) {
            cleanedStoredVisibility[id] = visible;
          }
        });
        saveVisibilityToStorage(cleanedStoredVisibility);

        hasInitialized.current = true;
      }
    }
  }, [initialCalendars]);

  // Persist visibility state to localStorage whenever it changes
  useEffect(() => {
    if (Object.keys(localVisibilityState).length > 0) {
      saveVisibilityToStorage(localVisibilityState);
    }
  }, [localVisibilityState]);

  // Update visible colors based on local visibility state for performance
  useEffect(() => {
    const visibleCalendars = calendars.filter(
      (cal) => localVisibilityState[cal.id] ?? cal.isVisible,
    );
    setVisibleColors(visibleCalendars.map((cal) => cal.color));
  }, [calendars, localVisibilityState]);

  // Debounced sync function to batch API updates
  const syncPendingUpdates = useCallback(async () => {
    if (!onUpdateCalendar || pendingUpdatesRef.current.size === 0) return;

    const updates = Array.from(pendingUpdatesRef.current);
    pendingUpdatesRef.current.clear();

    // Batch update all pending visibility changes
    try {
      await Promise.all(
        updates.map(async (calendarId) => {
          const newVisibility = localVisibilityState[calendarId];
          if (newVisibility !== undefined) {
            const updatedCalendar = await onUpdateCalendar(calendarId, {
              isVisible: newVisibility,
            });

            // Update the calendar in state to reflect the server response
            setCalendars((prev) =>
              prev.map((cal) =>
                cal.id === calendarId ? updatedCalendar : cal,
              ),
            );
          }
        }),
      );
    } catch (error) {
      console.error("Failed to sync calendar visibility updates:", error);
      // Could add error handling here, like reverting local state
    }
  }, [localVisibilityState, onUpdateCalendar]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  // Add a new calendar
  const addCalendar = async (calendarData: CreateCalendarData) => {
    if (onCreateCalendar) {
      try {
        const newCalendar = await onCreateCalendar(calendarData);
        setCalendars((prev) => [...prev, newCalendar]);
      } catch (error) {
        console.error("Failed to create calendar:", error);
        throw error;
      }
    }
  };

  // Optimized toggle calendar visibility with immediate local update
  const toggleCalendarVisibility = useCallback(
    async (calendarId: string) => {
      const currentVisibility =
        localVisibilityState[calendarId] ??
        calendars.find((cal) => cal.id === calendarId)?.isVisible ??
        false;

      const newVisibility = !currentVisibility;

      // Immediate optimistic update to local state
      setLocalVisibilityState((prev) => ({
        ...prev,
        [calendarId]: newVisibility,
      }));

      // Add to pending updates
      pendingUpdatesRef.current.add(calendarId);

      // Debounce API sync - clear existing timeout and set new one
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(() => {
        syncPendingUpdates();
      }, 500); // 500ms debounce
    },
    [localVisibilityState, calendars, syncPendingUpdates],
  );

  // Refresh calendars from API
  const refreshCalendars = async () => {
    if (onRefreshCalendars) {
      try {
        const refreshedCalendars = await onRefreshCalendars();
        setCalendars(refreshedCalendars);
      } catch (error) {
        console.error("Failed to refresh calendars:", error);
        throw error;
      }
    }
  };

  // Check if calendar is visible (uses local state for immediate response)
  const isCalendarVisible = useCallback(
    (calendarId: string) => {
      // Use local state first for immediate response, fallback to server state
      const localVisibility = localVisibilityState[calendarId];
      if (localVisibility !== undefined) {
        return localVisibility;
      }

      const calendar = calendars.find((cal) => cal.id === calendarId);
      return calendar?.isVisible ?? false;
    },
    [localVisibilityState, calendars],
  );

  // Get visible calendars (uses local state for immediate response)
  const getVisibleCalendars = useCallback(() => {
    return calendars.filter((cal) => {
      const localVisibility = localVisibilityState[cal.id];
      return localVisibility !== undefined ? localVisibility : cal.isVisible;
    });
  }, [calendars, localVisibilityState]);

  // Legacy color visibility functions
  const toggleColorVisibility = (color: string) => {
    setVisibleColors((prev) => {
      if (prev.includes(color)) {
        return prev.filter((c) => c !== color);
      } else {
        return [...prev, color];
      }
    });
  };

  const isColorVisible = (color: string | undefined) => {
    if (!color) return true;
    return visibleColors.includes(color);
  };

  // Custom setCurrentDate that validates the date before setting it
  const setCurrentDateWithPersistence = useCallback(
    (date: Date) => {
      const validatedDate = validateDate(date);
      setCurrentDate(validatedDate);
    },
    [validateDate],
  );

  // Utility function to reset to current date
  const clearSavedDate = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const value = {
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
  };

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}
