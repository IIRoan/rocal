"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  updateTheme: (theme: "light" | "dark" | "system") => Promise<void>;
};

export function useCalendarPresentation({
  calendarData,
  settings,
  settingsLoading,
  isCalendarVisible,
  currentDate,
  currentView,
  previewEvent,
  updateTheme,
}: UseCalendarPresentationOptions) {
  const [contextPreviewEvent, setContextPreviewEvent] =
    useState<UiCalendarEvent | null>(null);
  const initialView = settings?.defaultView || "month";
  const defaultCalendarId =
    settings?.defaultCalendarId || calendarData.calendars[0]?.id || "";

  const themeSettings = useMemo(
    () => ({
      currentTheme: (settings?.theme || "system") as
        | "light"
        | "dark"
        | "system",
      updateTheme,
    }),
    [settings?.theme, updateTheme],
  );

  const workingDays = useMemo(
    () => parseWorkingDays(settings?.workingDays),
    [settings?.workingDays],
  );

  const calendarMap = useMemo(
    () => createCalendarMap(calendarData.calendars),
    [calendarData.calendars],
  );

  const visibleCalendarIds = useMemo(
    () => createVisibleCalendarIdSet(calendarData.calendars, isCalendarVisible),
    [calendarData.calendars, isCalendarVisible],
  );

  const baseTransformedEvents = useMemo(
    () =>
      transformCalendarEvents(
        calendarData.events,
        calendarMap,
        visibleCalendarIds,
      ),
    [calendarData.events, calendarMap, visibleCalendarIds],
  );

  const transformedEvents = useMemo(
    () =>
      mergePreviewCalendarEvents({
        baseEvents: baseTransformedEvents,
        calendarMap,
        previewEvents: [previewEvent, contextPreviewEvent],
      }),
    [baseTransformedEvents, calendarMap, previewEvent, contextPreviewEvent],
  );

  const loadingState = useMemo(
    () =>
      resolveCalendarLoadingState({
        settingsLoading,
        calendarsLoading: calendarData.calendarsLoading,
        calendarCount: calendarData.calendars.length,
        categoriesLoading: calendarData.categoriesLoading,
        categoryCount: calendarData.categories.length,
        eventsLoading: calendarData.eventsLoading,
        eventCount: calendarData.events.length,
      }),
    [
      settingsLoading,
      calendarData.calendarsLoading,
      calendarData.calendars.length,
      calendarData.categoriesLoading,
      calendarData.categories.length,
      calendarData.eventsLoading,
      calendarData.events.length,
    ],
  );

  const handleSetPreview = useCallback(
    (event: UiCalendarEvent | null) => {
      setContextPreviewEvent(
        normalizePreviewEventCalendarId(event, defaultCalendarId),
      );
    },
    [defaultCalendarId],
  );

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
  }, [currentDate, currentView, prefetchRange]);

  return {
    defaultCalendarId,
    handleSetPreview,
    initialView,
    isAllInitialLoading: loadingState.isAllInitialLoading,
    overlayContext: loadingState.overlayContext,
    themeSettings,
    transformedEvents,
    workingDays,
  };
}
