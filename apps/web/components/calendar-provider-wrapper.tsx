"use client";

import { ReactNode } from "react";
import { CalendarProvider } from "@workspace/ui/components/calendar";
import { useSharedCalendarData } from "@/components/calendar-data-provider";

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
