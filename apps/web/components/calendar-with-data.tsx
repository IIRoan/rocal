"use client";

import { useMemo } from "react";
import {
  EventCalendar,
  CalendarView,
  AgendaDaysToShow,
  useCalendarContext,
} from "@workspace/ui/components/calendar";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { useCalendarData } from "@/hooks/use-calendar-data";
import { useSettings } from "@/hooks/use-settings";

// Define the Day type as expected by date-fns
// This type is often implicitly defined by date-fns, but explicitly defining it
// or importing it if available from date-fns might resolve the issue directly.
// For now, we'll define it as a union of literals.
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface CalendarWithDataProps {
  className?: string;
}

export function CalendarWithData({ className }: CalendarWithDataProps) {
  const { isCalendarVisible } = useCalendarContext();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();

  // Get the initial view from settings, fallback to month
  const initialView = settings?.defaultView || "month";

  // Calculate default date range for initial load
  const defaultDateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date;

    // Use weekStartDay from settings, fallback to 0 (Sunday)
    // Cast the weekStartsOn to the Day type to satisfy date-fns
    const weekStartsOn = (settings?.weekStartDay ?? 0) as Day;

    switch (initialView) {
      case "month":
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case "week":
        start = startOfWeek(now, { weekStartsOn });
        end = endOfWeek(now, { weekStartsOn });
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
  }, [initialView, settings?.weekStartDay]);

  // Use the calendar data hook with the calculated date range
  const calendarData = useCalendarData({
    initialDateRange: defaultDateRange,
    autoRefetch: true,
  });

  // Create theme settings for the calendar
  const themeSettings = useMemo(
    () => ({
      currentTheme: (settings?.theme || "system") as
        | "light"
        | "dark"
        | "system",
      updateTheme: async (theme: "light" | "dark" | "system") => {
        await updateSettings({ theme });
      },
    }),
    [settings?.theme, updateSettings]
  );

  // Optimized event filtering with memoized visibility check
  const transformedEvents = useMemo(() => {
    // Pre-compute visible calendar IDs once for better performance
    const visibleCalendarIds = new Set(
      calendarData.calendars
        .filter((cal) => isCalendarVisible(cal.id))
        .map((cal) => cal.id)
    );

    const transformedEventsList = calendarData.events
      .filter((event) => visibleCalendarIds.has(event.calendarId)) // O(1) lookup instead of function call per event
      .map((event) => {
        const transformed = {
          ...event,
          description: event.description ?? undefined,
          color: (event.color ?? undefined) as any,
          location: event.location ?? undefined,
          categoryId: event.categoryId ?? undefined,
          reminder: (event as any).reminder ?? undefined,
        };

        // Debug logging
        if (event.id && (event as any).reminder !== undefined) {
          console.log(
            "Event with reminder:",
            event.id,
            "reminder value:",
            (event as any).reminder,
            "transformed:",
            transformed.reminder
          );
        }

        return transformed;
      });

    return transformedEventsList;
  }, [calendarData.events, calendarData.calendars, isCalendarVisible]);

  // Don't render until settings are loaded to ensure proper initial view
  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading calendar...</div>
      </div>
    );
  }

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
      showWeekNumbers={settings?.showWeekNumbers}
      compactView={settings?.compactView}
      timeFormat={settings?.timeFormat}
      defaultReminder={settings?.defaultReminder}
      defaultEventDuration={settings?.defaultEventDuration}
      defaultCalendarId={settings?.defaultCalendarId}
      weekStartDay={settings?.weekStartDay}
      workingDays={
        settings?.workingDays
          ? JSON.parse(settings.workingDays)
          : [1, 2, 3, 4, 5]
      }
      timezone={settings?.timezone}
      themeSettings={themeSettings}
      onLoadNotifications={calendarData.loadNotifications}
      onUpdateNotifications={calendarData.updateNotifications}
    />
  );
}
