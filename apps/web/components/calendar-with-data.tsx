"use client";

import { useMemo } from "react";
import { 
  EventCalendar,
  CalendarView,
  AgendaDaysToShow
} from "@workspace/ui/components/calendar";
import { 
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth
} from "date-fns";
import { useCalendarData } from "@/hooks/use-calendar-data";

interface CalendarWithDataProps {
  className?: string;
  initialView?: CalendarView;
}

export function CalendarWithData({ 
  className, 
  initialView = "month" 
}: CalendarWithDataProps) {
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
    autoRefetch: true,
  });

  // Transform events to match UI component type expectations
  const transformedEvents = useMemo(() => 
    calendarData.events.map(event => ({
      ...event,
      description: event.description ?? undefined,
      color: (event.color ?? undefined) as any,
      location: event.location ?? undefined,
      categoryId: event.categoryId ?? undefined,
    })), [calendarData.events]
  );

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