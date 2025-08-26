"use client";
import { CalendarProvider } from "@workspace/ui/components/calendar";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
export function CalendarProviderWrapper({ children, }) {
    const calendarData = useSharedCalendarData();
    return (<CalendarProvider initialCalendars={calendarData.calendars} onCreateCalendar={calendarData.createCalendar} onUpdateCalendar={calendarData.updateCalendar} onRefreshCalendars={calendarData.refetchCalendars}>
      {children}
    </CalendarProvider>);
}
