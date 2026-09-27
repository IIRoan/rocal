"use client";

import React, { useEffect } from "react";
import {
  EventCalendar,
  useCalendarContext,
} from "@workspace/ui/components/calendar";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { useCalendarPresentation } from "@/hooks/use-calendar-presentation";
import { useSettings } from "@/hooks/use-settings";
import { useUserTimeFormat } from "@/hooks/use-user-time-format";
import { useRecurringMovePrompt } from "@/hooks/use-recurring-move-prompt";
import { useCommandPalette } from "./command-palette-context";
import { RecurringScopeModal } from "./command-palette/recurring-scope-modal";
import { useCalendarWorkspaceReady } from "@/components/calendar-workspace-ready";
import {
  FORCE_LOADING_DESIGN_PREVIEW,
  PageLoadingOverlay,
} from "@workspace/ui/components/ui";

interface CalendarWithDataProps {
  className?: string;
}

export function CalendarWithData({ className }: CalendarWithDataProps) {
  const { isCalendarVisible, currentDate, currentView } = useCalendarContext();
  const { settings, loading: settingsLoading } = useSettings();
  const timeFormat = useUserTimeFormat();
  const { openEventEditor, previewEvent } = useCommandPalette();
  const calendarData = useSharedCalendarData();
  const workspace = useCalendarWorkspaceReady();
  const { moveRecurringEvent, scopePrompt } = useRecurringMovePrompt(
    calendarData.editRecurringEvent,
  );
  const {
    defaultCalendarId,
    handleSetPreview,
    initialView,
    isAllInitialLoading,
    overlayContext,
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
  });

  useEffect(() => {
    if (FORCE_LOADING_DESIGN_PREVIEW || isAllInitialLoading) {
      return;
    }
    workspace?.markReady();
  }, [isAllInitialLoading, workspace]);

  // Stays mounted under the workspace overlay so the view paints in parallel; the shell hides chrome until markReady().
  return (
    <>
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
        onMoveRecurringEvent={moveRecurringEvent}
        onDeleteEvent={calendarData.deleteEvent}
        onCreateCategory={calendarData.createCategory}
        onDateRangeChange={calendarData.setDateRange}
        showWeekNumbers={settings?.showWeekNumbers}
        compactView={settings?.compactView}
        timeFormat={timeFormat}
        defaultEventDuration={settings?.defaultEventDuration}
        defaultCalendarId={defaultCalendarId}
        weekStartDay={settings?.weekStartDay}
        workingDays={workingDays}
        timezone={settings?.timezone}
        onLoadNotifications={calendarData.loadNotifications}
        onUpdateNotifications={calendarData.updateNotifications}
        onEventEdit={openEventEditor}
        onSetPreview={handleSetPreview}
        onPrefetchRange={calendarData.prefetchRange}
      />
      <RecurringScopeModal action="edit" {...scopePrompt} />
      {FORCE_LOADING_DESIGN_PREVIEW ? (
        <PageLoadingOverlay
          isLoading={true}
          messageContext={overlayContext}
          enableCycling={true}
        />
      ) : null}
    </>
  );
}
