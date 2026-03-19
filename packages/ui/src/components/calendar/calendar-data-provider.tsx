"use client";

import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import {
  useCalendarData,
  type UseCalendarDataOptions,
  type UseCalendarDataReturn,
} from "@workspace/calendar-client";

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
  options?: UseCalendarDataOptions;
}

export function CalendarDataProvider({
  children,
  options,
}: CalendarDataProviderProps) {
  const [isReady, setIsReady] = useState(false);

  const calendarData = useCalendarData({
    autoRefetch: true,
    cacheTimeout: 10 * 60 * 1000,
    ...options,
  });

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <CalendarDataContext.Provider value={calendarData}>
      {children}
    </CalendarDataContext.Provider>
  );
}
