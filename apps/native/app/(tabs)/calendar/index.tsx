import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
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
import { useCalendarView } from "../../../src/providers/CalendarViewProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import {
  getSurroundingCalendarDateRange,
  navigateCalendarDate,
} from "../../../src/components/calendar/navigation-utils";
import { CalendarViewSwitcher } from "../../../src/components/calendar/CalendarViewSwitcher";
import { CompactMonthStrip } from "../../../src/components/calendar/CompactMonthStrip";
import { MonthGrid } from "../../../src/components/calendar/MonthGrid";
import { SkeletonLoader } from "../../../src/components/calendar/SkeletonLoader";
import { SwipeableCalendarView } from "../../../src/components/calendar/SwipeableCalendarView";
import { WeekTimeline } from "../../../src/components/calendar/WeekTimeline";
import { DayTimeline } from "../../../src/components/calendar/DayTimeline";
import { ThreeDayTimeline } from "../../../src/components/calendar/ThreeDayTimeline";
import { AgendaList } from "../../../src/components/calendar/AgendaList";

// ─── Types ───────────────────────────────────────────────────────────────────

// ─── Component ───────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { theme } = useTheme();
  const { openEventSheet } = useSheet();
  const { activeView, setActiveView } = useCalendarView();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ─── State ───────────────────────────────────────────────────────────────────

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
  const detailDateRange = useMemo(() => {
    const weekStartDay = settings?.weekStartDay ?? 0;

    if (
      activeView === "day" ||
      activeView === "3day" ||
      activeView === "week"
    ) {
      return getSurroundingCalendarDateRange({
        currentDate: selectedDate,
        view: activeView,
        weekStartDay,
        pageRadius: 2,
      });
    }

    return getDefaultCalendarDateRange({
      baseDate: selectedDate,
      view: activeView,
      weekStartDay,
    });
  }, [selectedDate, activeView, settings?.weekStartDay]);

  // Fetch the current/adjacent month windows so swipe pages already have dots.
  const monthDateRange = useMemo(
    () =>
      getSurroundingCalendarDateRange({
        currentDate,
        view: "month",
        weekStartDay: settings?.weekStartDay,
        pageRadius: 1,
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
    placeholderData: (previousData) => previousData,
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
    if (settings?.defaultView) {
      setActiveView(settings.defaultView);
    }
  }, [settings?.defaultView, setActiveView]);

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
    eventsLoading: detailEventsLoading && detailEventsData == null,
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

  const handleDetailNavigate = useCallback(
    (direction: 1 | -1) => {
      setSelectedDate((prev) => {
        const next = navigateCalendarDate(prev, activeView, direction);
        setCurrentDate(next);
        return next;
      });
    },
    [activeView],
  );

  const handleDetailSwipeCommit = useCallback(
    (direction: 1 | -1) => {
      setCurrentDate(navigateCalendarDate(selectedDate, activeView, direction));
    },
    [activeView, selectedDate],
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
      {/* Header: menu, date title, mini-calendar toggle */}
      <CalendarViewSwitcher
        activeView={activeView}
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
      ) : activeView === "month" ? (
        <MonthGrid
          currentDate={currentDate}
          selectedDate={selectedDate}
          events={decoratedDetailEvents}
          weekStartDay={settings?.weekStartDay ?? 0}
          onDayPress={handleDayPress}
        />
      ) : activeView === "agenda" ? (
        <SwipeableCalendarView
          onSwipeLeft={() => handleDetailNavigate(1)}
          onSwipeRight={() => handleDetailNavigate(-1)}
        >
          <AgendaList
            events={decoratedDetailEvents}
            timeFormat={settings?.timeFormat ?? "12h"}
            refreshing={detailEventsLoading}
            onRefresh={() => refetchDetailEvents()}
            onEventPress={handleEventPress}
            onEventDelete={handleEventDelete}
          />
        </SwipeableCalendarView>
      ) : (
        <>
          {activeView === "week" && (
            <WeekTimeline
              currentDate={selectedDate}
              events={decoratedDetailEvents}
              weekStartDay={settings?.weekStartDay ?? 0}
              timeFormat={settings?.timeFormat ?? "12h"}
              onSwipeCommit={handleDetailSwipeCommit}
              onNavigate={handleDetailNavigate}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "day" && (
            <DayTimeline
              currentDate={selectedDate}
              events={decoratedDetailEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              onSwipeCommit={handleDetailSwipeCommit}
              onNavigate={handleDetailNavigate}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
          {activeView === "3day" && (
            <ThreeDayTimeline
              currentDate={selectedDate}
              events={decoratedDetailEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              onSwipeCommit={handleDetailSwipeCommit}
              onNavigate={handleDetailNavigate}
              onEventPress={handleEventPress}
              onTimeSlotPress={handleTimeSlotPress}
            />
          )}
        </>
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
