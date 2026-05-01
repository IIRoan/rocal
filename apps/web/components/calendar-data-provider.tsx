"use client";

import { createContext, useContext, useEffect, ReactNode } from "react";
import {
  useCalendarData,
  UseCalendarDataReturn,
} from "@/hooks/use-calendar-data";
import { useCalendarContext } from "@workspace/ui/components/calendar";

const CalendarDataContext = createContext<UseCalendarDataReturn | undefined>(
  undefined,
);

export function useSharedCalendarData() {
  const context = useContext(CalendarDataContext);
  if (!context) {
    throw new Error(
      "useSharedCalendarData must be used within a CalendarDataProvider",
    );
  }
  return context;
}

interface CalendarDataProviderProps {
  children: ReactNode;
}

export function CalendarDataProvider({ children }: CalendarDataProviderProps) {
  const calendarData = useCalendarData({
    autoRefetch: true,
    cacheTimeout: 10 * 60 * 1000, // 10 minutes cache
  });

  return (
    <CalendarDataContext.Provider value={calendarData}>
      {children}
    </CalendarDataContext.Provider>
  );
}

/**
 * Syncs the calendar context's currentDate to the data layer's active month.
 * Must be rendered inside both CalendarDataProvider and CalendarProvider.
 *
 * This is the ONLY thing that controls which month's data is fetched.
 * The EventCalendar onDateRangeChange callbacks are no-ops.
 */
export function CalendarDateSync() {
  const { currentDate } = useCalendarContext();
  const { setMonth } = useSharedCalendarData();

  useEffect(() => {
    setMonth(currentDate);
  }, [currentDate, setMonth]);

  return null;
}
