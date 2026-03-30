"use client";

import React, { useMemo, useRef, useEffect } from "react";
import {
  EventCalendar,
  CalendarView,
  AgendaDaysToShow,
  useCalendarContext,
  CalendarSkeleton,
} from "@workspace/ui/components/calendar";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useSettings } from "@/hooks/use-settings";
import { useCommandPalette } from "./command-palette-context";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

// Define the Day type as expected by date-fns
// This type is often implicitly defined by date-fns, but explicitly defining it
// or importing it if available from date-fns might resolve the issue directly.
// For now, we'll define it as a union of literals.
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface CalendarWithDataProps {
  className?: string;
}

export function CalendarWithData({ className }: CalendarWithDataProps) {
  const { isCalendarVisible, currentDate } = useCalendarContext();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { openEventEditor, previewEvent } = useCommandPalette();

  // Get the initial view from settings, fallback to month
  const initialView = settings?.defaultView || "month";

  // Calculate default date range for initial load using currentDate from context
  const defaultDateRange = useMemo(() => {
    // Use currentDate from calendar context instead of new Date()
    // This ensures we use the saved date from localStorage if available
    const baseDate = currentDate;
    let start: Date;
    let end: Date;

    // Use weekStartDay from settings, fallback to 1 (Monday)
    // Cast the weekStartsOn to the Day type to satisfy date-fns
    const weekStartsOn = (settings?.weekStartDay ?? 1) as Day;

    switch (initialView) {
      case "month":
        // Expand to full calendar grid (weeks surrounding the month)
        const mStart = startOfMonth(baseDate);
        const mEnd = endOfMonth(mStart);
        start = startOfWeek(mStart, { weekStartsOn });
        end = endOfWeek(mEnd, { weekStartsOn });
        break;
      case "week":
        start = startOfWeek(baseDate, { weekStartsOn });
        end = endOfWeek(baseDate, { weekStartsOn });
        break;
      case "day":
        start = new Date(baseDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(baseDate);
        end.setHours(23, 59, 59, 999);
        break;
      case "3day":
        start = addDays(baseDate, -1);
        start.setHours(0, 0, 0, 0);
        end = addDays(baseDate, 1);
        end.setHours(23, 59, 59, 999);
        break;
      case "agenda":
        start = new Date(baseDate);
        end = addDays(baseDate, AgendaDaysToShow - 1);
        break;
      default:
        start = startOfMonth(baseDate);
        end = endOfMonth(baseDate);
        break;
    }

    return { start, end };
  }, [initialView, settings?.weekStartDay, currentDate]);

  // Use the shared calendar data
  const calendarData = useSharedCalendarData();

  // Set the date range when component mounts (only once)
  const initializedRef = useRef(false);
  React.useEffect(() => {
    if (!initializedRef.current && !settingsLoading) {
      console.log("CalendarWithData - Setting initial date range:", {
        start: defaultDateRange.start.toISOString(),
        end: defaultDateRange.end.toISOString(),
        view: initialView,
      });
      calendarData.setDateRange(defaultDateRange);
      initializedRef.current = true;
    }
  }, [defaultDateRange, settingsLoading, calendarData]); // Add dependencies to ensure proper initialization

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
    [settings?.theme, updateSettings],
  );

  // Optimized event filtering with deep memoization
  const visibleCalendarIds = useMemo(() => {
    return new Set(
      calendarData.calendars
        .filter((cal) => isCalendarVisible(cal.id))
        .map((cal) => cal.id),
    );
  }, [calendarData.calendars, isCalendarVisible]);

  const transformedEvents = useMemo(() => {
    // Create a map of calendar IDs to calendar objects for quick lookup
    const calendarMap = new Map(
      calendarData.calendars.map((cal) => [cal.id, cal]),
    );

    const transformedEventsList: CalendarEvent[] = calendarData.events
      .filter((event) => visibleCalendarIds.has(event.calendarId)) // O(1) lookup
      .map((event) => {
        // Use event's color if it exists, otherwise fall back to calendar color
        const calendar = calendarMap.get(event.calendarId);
        const eventColor = event.color || calendar?.color || undefined;

        return {
          ...event,
          description: event.description ?? undefined,
          color: eventColor as any,
          location: event.location ?? undefined,
          categoryId: event.categoryId ?? undefined,
          reminder: (event as any).reminder ?? undefined,
        };
      });

    // Merge preview event into the list if it exists
    if (previewEvent) {
      const calendar = calendarMap.get(previewEvent.calendarId);
      const previewColor = previewEvent.color || calendar?.color || undefined;
      transformedEventsList.push({
        ...previewEvent,
        id: previewEvent.id || "__preview__",
        description: previewEvent.description ?? undefined,
        color: previewColor as any,
        location: previewEvent.location ?? undefined,
        categoryId: previewEvent.categoryId ?? undefined,
        reminder: (previewEvent as any).reminder ?? undefined,
        isPreview: true,
      });
    }

    return transformedEventsList;
  }, [
    calendarData.events,
    calendarData.calendars,
    visibleCalendarIds,
    previewEvent,
  ]); // Add calendars + previewEvent to deps

  // Show calendar skeleton and overlay until ALL core elements are ready:
  // - settings
  // - calendars & categories
  // - initial events (first load)
  const isStructureLoading =
    settingsLoading ||
    (calendarData.calendarsLoading && calendarData.calendars.length === 0) ||
    (calendarData.categoriesLoading && calendarData.categories.length === 0);

  const isInitialEventsLoading =
    calendarData.eventsLoading && calendarData.events.length === 0;

  const isAllInitialLoading = isStructureLoading || isInitialEventsLoading;

  const overlayContext = settingsLoading
    ? "SETTINGS_LOAD"
    : isStructureLoading
      ? "CALENDAR_LOAD"
      : isInitialEventsLoading
        ? "DATA_SYNC"
        : undefined;

  if (isAllInitialLoading) {
    return (
      <>
        <CalendarSkeleton view={initialView} className={className} />
        <PageLoadingOverlay
          isLoading={true}
          messageContext={overlayContext}
          enableCycling={true}
        />
      </>
    );
  }

  // After initial load, render the interactive calendar.
  // Avoid passing top-level loading to prevent internal skeleton that hides header.
  return (
    <EventCalendar
      className={className}
      initialView={initialView}
      events={transformedEvents}
      categories={calendarData.categories}
      loading={false}
      eventsLoading={
        calendarData.eventsLoading && calendarData.events.length === 0
      }
      error={calendarData.error}
      onCreateEvent={calendarData.createEvent}
      onUpdateEvent={calendarData.updateEvent}
      onDeleteEvent={calendarData.deleteEvent}
      onCreateCategory={calendarData.createCategory}
      onDateRangeChange={calendarData.setDateRange}
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
      onEventEdit={openEventEditor}
    />
  );
}

