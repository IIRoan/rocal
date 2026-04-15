"use client";

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { createLogger } from "@workspace/logger";
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
import { buildViewPrefetchRanges } from "@/hooks/use-calendar-events-loader";
import { useSettings } from "@/hooks/use-settings";
import { useCommandPalette } from "./command-palette-context";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

const log = createLogger("calendar-with-data");

// Define the Day type as expected by date-fns
// This type is often implicitly defined by date-fns, but explicitly defining it
// or importing it if available from date-fns might resolve the issue directly.
// For now, we'll define it as a union of literals.
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface CalendarWithDataProps {
  className?: string;
}

export function CalendarWithData({ className }: CalendarWithDataProps) {
  const { isCalendarVisible, currentDate, currentView } = useCalendarContext();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { openEventEditor, previewEvent } = useCommandPalette();

  // Context-menu preview: ghost event shown while right-click menu is open
  const [contextPreviewEvent, setContextPreviewEvent] = useState<CalendarEvent | null>(null);

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

  // Context-menu preview handler: resolves calendar fallback before storing
  const handleSetPreview = useCallback((event: CalendarEvent | null) => {
    if (event && !event.calendarId) {
      const fallbackId = calendarData.calendars?.[0]?.id || "";
      setContextPreviewEvent({ ...event, calendarId: fallbackId });
    } else {
      setContextPreviewEvent(event);
    }
  }, [calendarData.calendars]);

  // Set the date range when component mounts (only once)
  const initializedRef = useRef(false);
  React.useEffect(() => {
    if (!initializedRef.current && !settingsLoading) {
      log.debug("Setting initial date range:", {
        start: defaultDateRange.start.toISOString(),
        end: defaultDateRange.end.toISOString(),
        view: initialView,
      });
      calendarData.setDateRange(defaultDateRange);
      initializedRef.current = true;
    }
  }, [defaultDateRange, settingsLoading, calendarData]); // Add dependencies to ensure proper initialization

  // View-aware prefetch: when the view or date changes, prefetch adjacent periods
  useEffect(() => {
    if (!currentDate || !currentView) return;
    const ranges = buildViewPrefetchRanges(currentDate, currentView);

    const eagerRanges = ranges.slice(0, 2);
    const deferredRanges = ranges.slice(2);

    for (const range of eagerRanges) {
      calendarData.prefetchRange(range);
    }

    if (deferredRanges.length === 0) {
      return;
    }

    const runDeferredPrefetch = () => {
      for (const range of deferredRanges) {
        calendarData.prefetchRange(range);
      }
    };

    if ("requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(runDeferredPrefetch, {
        timeout: 400,
      });
      return () => {
        if ("cancelIdleCallback" in window) {
          (window as any).cancelIdleCallback(id);
        }
      };
    }

    const id = setTimeout(runDeferredPrefetch, 32);
    return () => clearTimeout(id);
  }, [currentDate, currentView, calendarData.prefetchRange]);

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

    // Merge context-menu preview (ghost event while right-click menu is open)
    if (contextPreviewEvent) {
      const calendar = calendarMap.get(contextPreviewEvent.calendarId);
      const previewColor = contextPreviewEvent.color || calendar?.color || undefined;
      transformedEventsList.push({
        ...contextPreviewEvent,
        description: contextPreviewEvent.description ?? undefined,
        color: previewColor as any,
        location: contextPreviewEvent.location ?? undefined,
        categoryId: contextPreviewEvent.categoryId ?? undefined,
        reminder: (contextPreviewEvent as any).reminder ?? undefined,
        isPreview: true,
      });
    }

    return transformedEventsList;
  }, [
    calendarData.events,
    calendarData.calendars,
    visibleCalendarIds,
    previewEvent,
    contextPreviewEvent,
  ]); // Add calendars + previewEvent + contextPreviewEvent to deps

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
  // Pass eventsLoading through so the events area shows a localized overlay
  // during navigation — the toolbar/header always stays fully visible.
  return (
    <EventCalendar
      className={className}
      initialView={initialView}
      events={transformedEvents}
      categories={calendarData.categories}
      loading={false}
      eventsLoading={calendarData.eventsLoading}
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
      onSetPreview={handleSetPreview}
      onPrefetchRange={calendarData.prefetchRange}
    />
  );
}
