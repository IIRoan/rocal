"use client";

import React, {
  useMemo,
  useRef,
  useEffect,
} from "react";
import { createLogger } from "@workspace/logger";
import {
  EventCalendar,
  useCalendarContext,
  CalendarSkeleton,
} from "@workspace/ui/components/calendar";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useCalendarPresentation } from "@/hooks/use-calendar-presentation";
import { useSettings } from "@/hooks/use-settings";
import { getDefaultCalendarDateRange } from "@/lib/calendar-view-model";
import { useCommandPalette } from "./command-palette-context";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

const log = createLogger("calendar-with-data");

interface CalendarWithDataProps {
  className?: string;
}

export function CalendarWithData({ className }: CalendarWithDataProps) {
  const { isCalendarVisible, currentDate, currentView } = useCalendarContext();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { openEventEditor, previewEvent } = useCommandPalette();
  const calendarData = useSharedCalendarData();
  const {
    defaultCalendarId,
    handleSetPreview,
    initialView,
    isAllInitialLoading,
    overlayContext,
    themeSettings,
    transformedEvents,
    workingDays,
  } = useCalendarPresentation({
    calendarData,
    settings,
    settingsLoading,
    isCalendarVisible,
    currentDate,
    currentView,
    previewEvent,
    updateTheme: async (theme) => {
      await updateSettings({ theme });
    },
  });

  // Get the initial view from settings, fallback to month
  const defaultDateRange = useMemo(() => {
    return getDefaultCalendarDateRange({
      baseDate: currentDate,
      view: initialView,
      weekStartDay: settings?.weekStartDay,
    });
  }, [currentDate, initialView, settings?.weekStartDay]);

  // Set the date range when component mounts (only once)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && !settingsLoading) {
      log.debug("Setting initial date range:", {
        start: defaultDateRange.start.toISOString(),
        end: defaultDateRange.end.toISOString(),
        view: initialView,
      });
      calendarData.setDateRange(defaultDateRange);
      initializedRef.current = true;
    }
  }, [defaultDateRange, settingsLoading, calendarData.setDateRange, initialView]);

  if (FORCE_LOADING_DESIGN_PREVIEW || isAllInitialLoading) {
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
      defaultEventDuration={settings?.defaultEventDuration}
      defaultCalendarId={defaultCalendarId}
      weekStartDay={settings?.weekStartDay}
      workingDays={workingDays}
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
