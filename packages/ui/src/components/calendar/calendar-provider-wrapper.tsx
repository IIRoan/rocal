"use client";

import { ReactNode } from "react";
import { CalendarProvider } from "./calendar-context";
import { useSharedCalendarData } from "./calendar-data-provider";

interface CalendarProviderWrapperProps {
  children: ReactNode;
}

export function CalendarProviderWrapper({
  children,
}: CalendarProviderWrapperProps) {
  const calendarData = useSharedCalendarData();

  return (
    <CalendarProvider
      initialCalendars={calendarData.calendars}
      onCreateCalendar={calendarData.createCalendar}
      onUpdateCalendar={calendarData.updateCalendar}
      onRefreshCalendars={calendarData.refetchCalendars}
    >
      {children}
    </CalendarProvider>
  );
}
