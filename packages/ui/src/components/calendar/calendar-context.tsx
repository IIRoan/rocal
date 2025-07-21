"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Calendar, EventColor, CreateCalendarData } from "./types";

interface CalendarContextType {
  // Date management
  currentDate: Date;
  setCurrentDate: (date: Date) => void;

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
  onUpdateCalendar?: (id: string, updates: Partial<Calendar>) => Promise<Calendar>;
  onRefreshCalendars?: () => Promise<Calendar[]>;
}

export function CalendarProvider({ 
  children, 
  initialCalendars = [], 
  onCreateCalendar, 
  onUpdateCalendar, 
  onRefreshCalendars 
}: CalendarProviderProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const hasInitialized = useRef(false);

  // Performance optimization: Local visibility state with debounced sync
  const [localVisibilityState, setLocalVisibilityState] = useState<Record<string, boolean>>({});
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Legacy color visibility for backward compatibility
  const [visibleColors, setVisibleColors] = useState<string[]>([]);

  // Initialize calendars and local visibility state
  useEffect(() => {
    if (initialCalendars.length > 0 && !hasInitialized.current) {
      setCalendars(initialCalendars);
      
      // Initialize local visibility state from calendar data
      const initialVisibility: Record<string, boolean> = {};
      initialCalendars.forEach(calendar => {
        initialVisibility[calendar.id] = calendar.isVisible;
      });
      setLocalVisibilityState(initialVisibility);
      
      hasInitialized.current = true;
    }
  }, [initialCalendars]);

  // Update visible colors based on local visibility state for performance
  useEffect(() => {
    const visibleCalendars = calendars.filter(cal => 
      localVisibilityState[cal.id] ?? cal.isVisible
    );
    setVisibleColors(visibleCalendars.map(cal => cal.color));
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
              isVisible: newVisibility
            });
            
            // Update the calendar in state to reflect the server response
            setCalendars(prev => 
              prev.map(cal => 
                cal.id === calendarId ? updatedCalendar : cal
              )
            );
          }
        })
      );
    } catch (error) {
      console.error('Failed to sync calendar visibility updates:', error);
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
        setCalendars(prev => [...prev, newCalendar]);
      } catch (error) {
        console.error('Failed to create calendar:', error);
        throw error;
      }
    }
  };

  // Optimized toggle calendar visibility with immediate local update
  const toggleCalendarVisibility = useCallback((calendarId: string) => {
    const currentVisibility = localVisibilityState[calendarId] ?? 
                               calendars.find(cal => cal.id === calendarId)?.isVisible ?? 
                               false;
    
    const newVisibility = !currentVisibility;
    
    // Immediate optimistic update to local state
    setLocalVisibilityState(prev => ({
      ...prev,
      [calendarId]: newVisibility
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
  }, [localVisibilityState, calendars, syncPendingUpdates]);

  // Refresh calendars from API
  const refreshCalendars = async () => {
    if (onRefreshCalendars) {
      try {
        const refreshedCalendars = await onRefreshCalendars();
        setCalendars(refreshedCalendars);
      } catch (error) {
        console.error('Failed to refresh calendars:', error);
        throw error;
      }
    }
  };

  // Check if calendar is visible (uses local state for immediate response)
  const isCalendarVisible = useCallback((calendarId: string) => {
    // Use local state first for immediate response, fallback to server state
    const localVisibility = localVisibilityState[calendarId];
    if (localVisibility !== undefined) {
      return localVisibility;
    }
    
    const calendar = calendars.find(cal => cal.id === calendarId);
    return calendar?.isVisible ?? false;
  }, [localVisibilityState, calendars]);

  // Get visible calendars (uses local state for immediate response)
  const getVisibleCalendars = useCallback(() => {
    return calendars.filter(cal => {
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

  const value = {
    currentDate,
    setCurrentDate,
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
