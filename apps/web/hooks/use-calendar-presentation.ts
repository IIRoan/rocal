"use client";

import { useEffect, useState } from "react";
import type {
  CalendarEvent as UiCalendarEvent,
  CalendarView,
} from "@workspace/ui/components/calendar";

import {
  createCalendarMap,
  createVisibleCalendarIdSet,
  mergePreviewCalendarEvents,
  normalizePreviewEventCalendarId,
  parseWorkingDays,
  resolveCalendarLoadingState,
  transformCalendarEvents,
} from "@/lib/calendar-view-model";
import type { UserSettings } from "@/lib/types/calendar";
import { buildViewPrefetchRanges } from "./use-calendar-events-loader";
import type { UseCalendarDataReturn } from "./use-calendar-data";

type CalendarPresentationData = Pick<
  UseCalendarDataReturn,
  | "calendars"
  | "events"
  | "categories"
  | "calendarsLoading"
  | "categoriesLoading"
  | "eventsLoading"
  | "prefetchRange"
>;

type UseCalendarPresentationOptions = {
  calendarData: CalendarPresentationData;
  settings?: UserSettings | null;
  settingsLoading: boolean;
  isCalendarVisible: (calendarId: string) => boolean;
  currentDate?: Date | null;
  currentView?: CalendarView | null;
  previewEvent?: UiCalendarEvent | null;
};

export function useCalendarPresentation({
  calendarData,
  settings,
  settingsLoading,
  isCalendarVisible,
  currentDate,
  currentView,
  previewEvent,
}: UseCalendarPresentationOptions) {
  const [contextPreviewEvent, setContextPreviewEvent] =
    useState<UiCalendarEvent | null>(null);
  const initialView = settings?.defaultView || "month";
  const defaultCalendarId =
    settings?.defaultCalendarId || calendarData.calendars[0]?.id || "";

  const workingDays = parseWorkingDays(settings?.workingDays);

  const calendarMap = createCalendarMap(calendarData.calendars);

  const visibleCalendarIds = createVisibleCalendarIdSet(calendarData.calendars, isCalendarVisible);

  const baseTransformedEvents = transformCalendarEvents(
    calendarData.events,
    calendarMap,
    visibleCalendarIds,
  );

  const transformedEvents = mergePreviewCalendarEvents({
    baseEvents: baseTransformedEvents,
    calendarMap,
    previewEvents: [previewEvent, contextPreviewEvent],
  });

  const loadingState = resolveCalendarLoadingState({
    settingsLoading,
    calendarsLoading: calendarData.calendarsLoading,
    calendarCount: calendarData.calendars.length,
    categoriesLoading: calendarData.categoriesLoading,
    categoryCount: calendarData.categories.length,
    eventsLoading: calendarData.eventsLoading,
    eventCount: calendarData.events.length,
  });

  const handleSetPreview = (event: UiCalendarEvent | null) => {
    setContextPreviewEvent(
      normalizePreviewEventCalendarId(event, defaultCalendarId),
    );
  };

  const { prefetchRange } = calendarData;

  useEffect(() => {
    if (!currentDate || !currentView) {
      return;
    }

    const ranges = buildViewPrefetchRanges(currentDate, currentView);
    const eagerRanges = ranges.slice(0, 2);
    const deferredRanges = ranges.slice(2);

    for (const range of eagerRanges) {
      prefetchRange(range);
    }

    if (deferredRanges.length === 0) {
      return;
    }

    const runDeferredPrefetch = () => {
      for (const range of deferredRanges) {
        prefetchRange(range);
      }
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(runDeferredPrefetch, {
        timeout: 400,
      });

      return () => {
        if ("cancelIdleCallback" in window) {
          window.cancelIdleCallback(id);
        }
      };
    }

    const id = setTimeout(runDeferredPrefetch, 32);
    return () => clearTimeout(id);
  }, [currentDate, currentView, prefetchRange]);

  return {
    defaultCalendarId,
    handleSetPreview,
    initialView,
    isAllInitialLoading: loadingState.isAllInitialLoading,
    overlayContext: loadingState.overlayContext,
    transformedEvents,
    workingDays,
  };
}
