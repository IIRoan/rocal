import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  type CalendarView,
  type DecoratedCalendarEvent,
  getDefaultCalendarDateRange,
  createCalendarMap,
  createVisibleCalendarIdSet,
  transformCalendarEvents,
  resolveCalendarLoadingState,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { navigateCalendarDate } from "../../../src/components/calendar/navigation-utils";
import { CalendarViewSwitcher } from "../../../src/components/calendar/CalendarViewSwitcher";
import { SkeletonLoader } from "../../../src/components/calendar/SkeletonLoader";
import { SwipeableCalendarView } from "../../../src/components/calendar/SwipeableCalendarView";
import { MonthGrid } from "../../../src/components/calendar/MonthGrid";
import { WeekTimeline } from "../../../src/components/calendar/WeekTimeline";
import { DayTimeline } from "../../../src/components/calendar/DayTimeline";
import { ThreeDayTimeline } from "../../../src/components/calendar/ThreeDayTimeline";
import { AgendaList } from "../../../src/components/calendar/AgendaList";

// ─── Component ───────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ─── State ───────────────────────────────────────────────────────────────────

  const [activeView, setActiveView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
  });

  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  const dateRange = useMemo(
    () =>
      getDefaultCalendarDateRange({
        baseDate: currentDate,
        view: activeView,
        weekStartDay: settings?.weekStartDay,
      }),
    [currentDate, activeView, settings?.weekStartDay],
  );

  const {
    data: eventsData,
    isLoading: eventsLoading,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: QUERY_KEYS.events(
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
    ),
    queryFn: () => calendarApiService.getEvents(dateRange.start, dateRange.end),
    enabled: !settingsLoading,
  });

  // ─── Sync default view from settings ───────────────────────────────────────

  useEffect(() => {
    if (settings?.defaultView) {
      setActiveView(settings.defaultView);
    }
  }, [settings?.defaultView]);

  // ─── Event transformation ──────────────────────────────────────────────────

  const calendarList = calendars ?? [];
  const calendarMap = useMemo(
    () => createCalendarMap(calendarList),
    [calendarList],
  );
  const visibleCalendarIds = useMemo(
    () =>
      createVisibleCalendarIdSet(calendarList, (id) => {
        const cal = calendarMap.get(id);
        return cal?.isVisible ?? true;
      }),
    [calendarList, calendarMap],
  );
  const decoratedEvents = useMemo(
    () =>
      transformCalendarEvents(
        eventsData?.events ?? [],
        calendarMap,
        visibleCalendarIds,
      ),
    [eventsData?.events, calendarMap, visibleCalendarIds],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  const loadingState = resolveCalendarLoadingState({
    settingsLoading,
    calendarsLoading,
    calendarCount: calendarList.length,
    categoriesLoading: false,
    categoryCount: 0,
    eventsLoading,
    eventCount: decoratedEvents.length,
  });

  // ─── Navigation handlers ──────────────────────────────────────────────────

  const handleNavigateForward = useCallback(() => {
    setCurrentDate((prev) => navigateCalendarDate(prev, activeView, 1));
  }, [activeView]);

  const handleNavigateBackward = useCallback(() => {
    setCurrentDate((prev) => navigateCalendarDate(prev, activeView, -1));
  }, [activeView]);

  const handleTodayPress = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleViewChange = useCallback((view: CalendarView) => {
    setActiveView(view);
  }, []);

  const handleDayPress = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  const handleEventPress = useCallback(
    (event: DecoratedCalendarEvent) => {
      router.push(`/event/${event.id}`);
    },
    [router],
  );

  const handleTimeSlotPress = useCallback(
    (date: Date, hour: number) => {
      router.push(`/event/create?date=${date.toISOString()}&hour=${hour}`);
    },
    [router],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <CalendarViewSwitcher
        activeView={activeView}
        onViewChange={handleViewChange}
        currentDate={currentDate}
        weekStartDay={settings?.weekStartDay ?? 0}
        onTodayPress={handleTodayPress}
        onForwardPress={handleNavigateForward}
        onBackwardPress={handleNavigateBackward}
      />

      {loadingState.isAllInitialLoading ? (
        <SkeletonLoader view={activeView} />
      ) : (
        <SwipeableCalendarView
          onSwipeLeft={handleNavigateForward}
          onSwipeRight={handleNavigateBackward}
        >
          {activeView === "month" && (
            <MonthGrid
              currentDate={currentDate}
              selectedDate={selectedDate}
              events={decoratedEvents}
              weekStartDay={settings?.weekStartDay ?? 0}
              onDayPress={handleDayPress}
            />
          )}
          {activeView === "week" && (
            <WeekTimeline
              currentDate={currentDate}
              events={decoratedEvents}
              weekStartDay={settings?.weekStartDay ?? 0}
              timeFormat={settings?.timeFormat ?? "12h"}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "day" && (
            <DayTimeline
              currentDate={currentDate}
              events={decoratedEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "3day" && (
            <ThreeDayTimeline
              currentDate={currentDate}
              events={decoratedEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "agenda" && (
            <AgendaList
              events={decoratedEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              refreshing={eventsLoading}
              onRefresh={() => refetchEvents()}
              onEventPress={handleEventPress}
            />
          )}
        </SwipeableCalendarView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
  } satisfies Record<string, ViewStyle>;

  return StyleSheet.create(view);
}
