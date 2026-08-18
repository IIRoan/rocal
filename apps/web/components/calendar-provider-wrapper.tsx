"use client";

import { ReactNode } from "react";
import { CalendarProvider, type CalendarView } from "@workspace/ui/components/calendar";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useSettings } from "@/hooks/use-settings";

interface CalendarProviderWrapperProps {
  children: ReactNode;
}

export function CalendarProviderWrapper({
  children,
}: CalendarProviderWrapperProps) {
  const calendarData = useSharedCalendarData();
  const { settings } = useSettings();
  const defaultView = (settings?.defaultView ?? "month") as CalendarView;

  return (
    <CalendarProvider
      defaultView={defaultView}
      initialCalendars={calendarData.calendars}
      onCreateCalendar={calendarData.createCalendar}
      onUpdateCalendar={calendarData.updateCalendar}
      onRefreshCalendars={calendarData.refetchCalendars}
    >
      {children}
    </CalendarProvider>
  );
}
