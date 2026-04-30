import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useSheet } from "../../../src/providers/SheetProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { navigateCalendarDate } from "../../../src/components/calendar/navigation-utils";
import { CalendarViewSwitcher } from "../../../src/components/calendar/CalendarViewSwitcher";
import { CompactMonthStrip } from "../../../src/components/calendar/CompactMonthStrip";
import { SkeletonLoader } from "../../../src/components/calendar/SkeletonLoader";
import { SwipeableCalendarView } from "../../../src/components/calendar/SwipeableCalendarView";
import { WeekTimeline } from "../../../src/components/calendar/WeekTimeline";
import { DayTimeline } from "../../../src/components/calendar/DayTimeline";
import { ThreeDayTimeline } from "../../../src/components/calendar/ThreeDayTimeline";
import { AgendaList } from "../../../src/components/calendar/AgendaList";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Detail views that appear below the month strip */
type DetailView = Exclude<CalendarView, "month">;

// ─── Component ───────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { theme } = useTheme();
  const { openEventSheet } = useSheet();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ─── State ───────────────────────────────────────────────────────────────────

  const [activeView, setActiveView] = useState<DetailView>("day");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [monthStripExpanded, setMonthStripExpanded] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
  });

  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  // Fetch events for the detail view's date range
  const detailDateRange = useMemo(
    () =>
      getDefaultCalendarDateRange({
        baseDate: selectedDate,
        view: activeView,
        weekStartDay: settings?.weekStartDay,
      }),
    [selectedDate, activeView, settings?.weekStartDay],
  );

  // Also fetch events for the month strip (full month range for dots)
  const monthDateRange = useMemo(
    () =>
      getDefaultCalendarDateRange({
        baseDate: currentDate,
        view: "month",
        weekStartDay: settings?.weekStartDay,
      }),
    [currentDate, settings?.weekStartDay],
  );

  const {
    data: detailEventsData,
    isLoading: detailEventsLoading,
    refetch: refetchDetailEvents,
  } = useQuery({
    queryKey: QUERY_KEYS.events(
      detailDateRange.start.toISOString(),
      detailDateRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(detailDateRange.start, detailDateRange.end),
    enabled: !settingsLoading,
  });

  const { data: monthEventsData } = useQuery({
    queryKey: QUERY_KEYS.events(
      monthDateRange.start.toISOString(),
      monthDateRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(monthDateRange.start, monthDateRange.end),
    enabled: !settingsLoading,
  });

  // ─── Sync default view from settings ───────────────────────────────────────

  useEffect(() => {
    if (settings?.defaultView && settings.defaultView !== "month") {
      setActiveView(settings.defaultView as DetailView);
    }
  }, [settings?.defaultView]);

  // ─── Event deletion (swipe-to-delete in agenda) ───────────────────────────

  const queryClient = useQueryClient();

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => calendarApiService.deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

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

  // Events for the detail view (day/week/3day/agenda)
  const decoratedDetailEvents = useMemo(
    () =>
      transformCalendarEvents(
        detailEventsData?.events ?? [],
        calendarMap,
        visibleCalendarIds,
      ),
    [detailEventsData?.events, calendarMap, visibleCalendarIds],
  );

  // Events for the month strip dots
  const decoratedMonthEvents = useMemo(
    () =>
      transformCalendarEvents(
        monthEventsData?.events ?? [],
        calendarMap,
        visibleCalendarIds,
      ),
    [monthEventsData?.events, calendarMap, visibleCalendarIds],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  const loadingState = resolveCalendarLoadingState({
    settingsLoading,
    calendarsLoading,
    calendarCount: calendarList.length,
    categoriesLoading: false,
    categoryCount: 0,
    eventsLoading: detailEventsLoading,
    eventCount: decoratedDetailEvents.length,
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleNavigateForward = useCallback(() => {
    const next = navigateCalendarDate(currentDate, "month", 1);
    const firstOfMonth = new Date(next.getFullYear(), next.getMonth(), 1);
    setCurrentDate(firstOfMonth);
    setSelectedDate(firstOfMonth);
  }, [currentDate]);

  const handleNavigateBackward = useCallback(() => {
    const prev = navigateCalendarDate(currentDate, "month", -1);
    const firstOfMonth = new Date(prev.getFullYear(), prev.getMonth(), 1);
    setCurrentDate(firstOfMonth);
    setSelectedDate(firstOfMonth);
  }, [currentDate]);

  const handleTodayPress = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  }, []);

  const handleViewChange = useCallback((view: CalendarView) => {
    if (view !== "month") {
      setActiveView(view as DetailView);
    }
  }, []);

  // When a day is tapped in the month strip, select it and navigate
  const handleDayPress = useCallback((date: Date) => {
    setSelectedDate(date);
    setCurrentDate(date);
    setMonthStripExpanded(false);
  }, []);

  const handleMonthChange = useCallback((direction: 1 | -1) => {
    setCurrentDate((prev) => {
      const next = navigateCalendarDate(prev, "month", direction);
      const firstOfMonth = new Date(next.getFullYear(), next.getMonth(), 1);
      setSelectedDate(firstOfMonth);
      return firstOfMonth;
    });
  }, []);

  const handleToggleMonthStrip = useCallback(() => {
    setMonthStripExpanded((prev) => !prev);
  }, []);

  const handleEventPress = useCallback(
    (event: DecoratedCalendarEvent) => {
      openEventSheet({ type: "view", eventId: event.id });
    },
    [openEventSheet],
  );

  const handleTimeSlotPress = useCallback(
    (date: Date, hour: number) => {
      openEventSheet({
        type: "create",
        date: date.toISOString(),
        hour: String(hour),
      });
    },
    [openEventSheet],
  );

  const handleEventDelete = useCallback(
    (eventId: string) => {
      deleteEventMutation.mutate(eventId);
    },
    [deleteEventMutation],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header: navigation arrows, date title, view switcher */}
      <CalendarViewSwitcher
        activeView={activeView}
        onViewChange={handleViewChange}
        currentDate={currentDate}
        weekStartDay={settings?.weekStartDay ?? 0}
        onTodayPress={handleTodayPress}
        onForwardPress={handleNavigateForward}
        onBackwardPress={handleNavigateBackward}
        monthStripExpanded={monthStripExpanded}
        onToggleMonthStrip={handleToggleMonthStrip}
      />

      {/* Compact month strip with event dots */}
      <CompactMonthStrip
        currentDate={currentDate}
        selectedDate={selectedDate}
        events={decoratedMonthEvents}
        weekStartDay={settings?.weekStartDay ?? 0}
        expanded={monthStripExpanded}
        onDayPress={handleDayPress}
        onMonthChange={handleMonthChange}
        onToggleExpand={handleToggleMonthStrip}
      />

      {/* Separator */}
      <View style={styles.separator} />

      {/* Detail view below the strip */}
      {loadingState.isAllInitialLoading ? (
        <SkeletonLoader view={activeView} />
      ) : (
        <SwipeableCalendarView
          onSwipeLeft={() => {
            setSelectedDate((prev) =>
              navigateCalendarDate(prev, activeView, 1),
            );
            setCurrentDate((prev) =>
              navigateCalendarDate(prev, activeView, 1),
            );
          }}
          onSwipeRight={() => {
            setSelectedDate((prev) =>
              navigateCalendarDate(prev, activeView, -1),
            );
            setCurrentDate((prev) =>
              navigateCalendarDate(prev, activeView, -1),
            );
          }}
        >
          {activeView === "week" && (
            <WeekTimeline
              currentDate={selectedDate}
              events={decoratedDetailEvents}
              weekStartDay={settings?.weekStartDay ?? 0}
              timeFormat={settings?.timeFormat ?? "12h"}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "day" && (
            <DayTimeline
              currentDate={selectedDate}
              events={decoratedDetailEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "3day" && (
            <ThreeDayTimeline
              currentDate={selectedDate}
              events={decoratedDetailEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "agenda" && (
            <AgendaList
              events={decoratedDetailEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              refreshing={detailEventsLoading}
              onRefresh={() => refetchDetailEvents()}
              onEventPress={handleEventPress}
              onEventDelete={handleEventDelete}
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
    separator: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
  } satisfies Record<string, ViewStyle>;

  return StyleSheet.create(view);
}
