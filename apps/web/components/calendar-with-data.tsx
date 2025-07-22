"use client";

import { useMemo, useEffect } from "react";
import { 
  EventCalendar,
  CalendarView,
  AgendaDaysToShow,
  useCalendarContext
} from "@workspace/ui/components/calendar";
import { 
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth
} from "date-fns";
import { useCalendarData } from "@/hooks/use-calendar-data-v2";

interface CalendarWithDataProps {
  className?: string;
  initialView?: CalendarView;
}

export function CalendarWithData({ 
  className, 
  initialView = "month" 
}: CalendarWithDataProps) {
  const { isCalendarVisible } = useCalendarContext();
  // Calculate default date range for initial load
  const defaultDateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (initialView) {
      case "month":
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case "week":
        start = startOfWeek(now, { weekStartsOn: 0 });
        end = endOfWeek(now, { weekStartsOn: 0 });
        break;
      case "day":
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end = new Date(now);
        end.setHours(23, 59, 59, 999);
        break;
      case "agenda":
        start = new Date(now);
        end = addDays(now, AgendaDaysToShow - 1);
        break;
      default:
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
    }

    return { start, end };
  }, [initialView]);

  // Use the calendar data hook with the calculated date range
  const calendarData = useCalendarData({
    initialDateRange: defaultDateRange,
  });

  // Update date range when calendar view changes
  useEffect(() => {
    calendarData.setDateRange(defaultDateRange);
  }, [defaultDateRange, calendarData]);

  // Optimized event filtering with memoized visibility check
  const transformedEvents = useMemo(() => {
    // Pre-compute visible calendar IDs once for better performance
    const visibleCalendarIds = new Set(
      calendarData.calendars
        .filter(cal => isCalendarVisible(cal.id))
        .map(cal => cal.id)
    );
    
    return calendarData.events
      .filter(event => visibleCalendarIds.has(event.calendarId)) // O(1) lookup instead of function call per event
      .map(event => ({
        ...event,
        description: event.description ?? undefined,
        color: (event.color ?? undefined) as any,
        location: event.location ?? undefined,
        categoryId: event.categoryId ?? undefined,
      }));
  }, [calendarData.events, calendarData.calendars, isCalendarVisible]);

  return (
    <EventCalendar
      className={className}
      initialView={initialView}
      events={transformedEvents}
      categories={calendarData.categories}
      loading={calendarData.loading}
      eventsLoading={calendarData.eventsLoading}
      error={calendarData.error}
      onCreateEvent={calendarData.createEvent}
      onUpdateEvent={calendarData.updateEvent}
      onDeleteEvent={calendarData.deleteEvent}
      onCreateCategory={calendarData.createCategory}
    />
  );
}