"use client";

import React from "react";
import {
  EventCalendar,
  useCalendarContext,
} from "@workspace/ui/components/calendar";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useCalendarPresentation } from "@/hooks/use-calendar-presentation";
import { useSettings } from "@/hooks/use-settings";
import { useCommandPalette } from "./command-palette-context";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";

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

  // No initialization effect needed — CalendarDateSync (rendered in the
  // dashboard layout) drives the active month from currentDate in the context.

  if (FORCE_LOADING_DESIGN_PREVIEW || isAllInitialLoading) {
    return (
      <PageLoadingOverlay
        isLoading={true}
        messageContext={overlayContext}
        enableCycling={true}
      />
    );
  }

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
