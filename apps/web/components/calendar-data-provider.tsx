"use client";

import { createContext, use, ReactNode } from "react";
import {
  useCalendarData,
  UseCalendarDataReturn,
} from "@/hooks/use-calendar-data";
import { useBootstrapCalendarDate } from "@workspace/ui/components/calendar";
import { useSettings } from "@/hooks/use-settings";

const CalendarDataContext = createContext<UseCalendarDataReturn | undefined>(
  undefined,
);

export function useSharedCalendarData() {
  const context = use(CalendarDataContext);
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
  const { settings } = useSettings();
  const initialDate = useBootstrapCalendarDate();
  const calendarData = useCalendarData({
    autoRefetch: true,
    cacheTimeout: 10 * 60 * 1000, // 10 minutes cache
    timezone: settings?.timezone,
    initialDate,
  });

  return (
    <CalendarDataContext.Provider value={calendarData}>
      {children}
    </CalendarDataContext.Provider>
  );
}
