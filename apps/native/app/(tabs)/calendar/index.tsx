import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { addMonths, subMonths } from "date-fns";
import {
  buildPaddedCalendarMonthRanges,
  type DecoratedCalendarEvent,
  getDefaultCalendarDateRange,
  getPaddedCalendarMonthRange,
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
import { getThreeDayStripDates } from "../../../src/components/calendar/timeline-utils";
import { CalendarViewSwitcher } from "../../../src/components/calendar/CalendarViewSwitcher";
import { CompactMonthStrip } from "../../../src/components/calendar/CompactMonthStrip";
import { MonthGrid } from "../../../src/components/calendar/MonthGrid";
import { SkeletonLoader } from "../../../src/components/calendar/SkeletonLoader";
import { SwipeableCalendarView } from "../../../src/components/calendar/SwipeableCalendarView";
import { WeekTimeline } from "../../../src/components/calendar/WeekTimeline";
import { DayTimeline } from "../../../src/components/calendar/DayTimeline";
import { ThreeDayTimeline } from "../../../src/components/calendar/ThreeDayTimeline";
import { AgendaList } from "../../../src/components/calendar/AgendaList";
import type { TimelinePage } from "../../../src/components/calendar/TimelinePager";
import { mergeMonthEventResponses } from "../../../src/components/calendar/month-events-utils";

export default function CalendarScreen() {
  const { theme } = useTheme();
  const { openEventSheet } = useSheet();
  const queryClient = useQueryClient();
  const {
    activeView,
    currentDate,
    selectedDate,
    setActiveView,
    setCurrentDate,
    setSelectedDate,
  } = useCalendarView();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [monthStripExpanded, setMonthStripExpanded] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
  });

  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

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

  const monthEventsCenter = currentDate;

  const previousMonth = useMemo(
    () => subMonths(monthEventsCenter, 1),
    [monthEventsCenter],
  );
  const nextMonth = useMemo(
    () => addMonths(monthEventsCenter, 1),
    [monthEventsCenter],
  );
  const previousMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(previousMonth),
    [previousMonth],
  );
  const currentMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(monthEventsCenter),
    [monthEventsCenter],
  );
  const nextMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(nextMonth),
    [nextMonth],
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
    placeholderData:
      activeView === "month" ? undefined : (previousData) => previousData,
  });

  useEffect(() => {
    for (const range of buildPaddedCalendarMonthRanges(monthEventsCenter, {
      adjacentMonthDepth: 2,
    })) {
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.events(
          range.start.toISOString(),
          range.end.toISOString(),
        ),
        queryFn: () => calendarApiService.getEvents(range.start, range.end),
        staleTime: 120_000,
      });
    }
  }, [monthEventsCenter, queryClient]);

  const { data: previousMonthEventsData, isPending: isPreviousMonthPending } =
    useQuery({
      queryKey: QUERY_KEYS.events(
        previousMonthRange.start.toISOString(),
        previousMonthRange.end.toISOString(),
      ),
      queryFn: () =>
        calendarApiService.getEvents(
          previousMonthRange.start,
          previousMonthRange.end,
        ),
      enabled: !settingsLoading,
      staleTime: 120_000,
      placeholderData: keepPreviousData,
    });

  const { data: currentMonthEventsData, isPending: isCurrentMonthPending } =
    useQuery({
      queryKey: QUERY_KEYS.events(
        currentMonthRange.start.toISOString(),
        currentMonthRange.end.toISOString(),
      ),
      queryFn: () =>
        calendarApiService.getEvents(
          currentMonthRange.start,
          currentMonthRange.end,
        ),
      enabled: !settingsLoading,
      staleTime: 120_000,
      placeholderData: keepPreviousData,
    });

  const { data: nextMonthEventsData, isPending: isNextMonthPending } = useQuery(
    {
      queryKey: QUERY_KEYS.events(
        nextMonthRange.start.toISOString(),
        nextMonthRange.end.toISOString(),
      ),
      queryFn: () =>
        calendarApiService.getEvents(nextMonthRange.start, nextMonthRange.end),
      enabled: !settingsLoading,
      staleTime: 120_000,
      placeholderData: keepPreviousData,
    },
  );

  useEffect(() => {
    if (settings?.defaultView) {
      setActiveView(settings.defaultView);
    }
  }, [settings?.defaultView, setActiveView]);

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => calendarApiService.deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const calendarList = useMemo(() => calendars ?? [], [calendars]);
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

  const mergedMonthEventsData = useMemo(
    () =>
      mergeMonthEventResponses([
        previousMonthEventsData,
        currentMonthEventsData,
        nextMonthEventsData,
      ]),
    [currentMonthEventsData, nextMonthEventsData, previousMonthEventsData],
  );

  const decoratedDetailEvents = useMemo(
    () =>
      transformCalendarEvents(
        detailEventsData?.events ?? [],
        calendarMap,
        visibleCalendarIds,
      ),
    [detailEventsData?.events, calendarMap, visibleCalendarIds],
  );

  const decoratedMonthEvents = useMemo(
    () =>
      transformCalendarEvents(
        mergedMonthEventsData.events,
        calendarMap,
        visibleCalendarIds,
      ),
    [mergedMonthEventsData.events, calendarMap, visibleCalendarIds],
  );

  const isMonthStripEventsPending =
    isPreviousMonthPending || isCurrentMonthPending || isNextMonthPending;

  const stableMonthStripEventsRef = useRef(decoratedMonthEvents);
  if (!isMonthStripEventsPending) {
    stableMonthStripEventsRef.current = decoratedMonthEvents;
  }
  const monthStripEvents = stableMonthStripEventsRef.current;

  const loadingState = resolveCalendarLoadingState({
    settingsLoading,
    calendarsLoading,
    calendarCount: calendarList.length,
    categoriesLoading: false,
    categoryCount: 0,
    eventsLoading: detailEventsLoading && detailEventsData == null,
    eventCount: decoratedDetailEvents.length,
  });

  const monthStartDate = useCallback((date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }, []);

  const navigateMonth = useCallback(
    (direction: 1 | -1, moveSelection = !monthStripExpanded) => {
      const advanceMonth = (base: Date) => {
        const next = navigateCalendarDate(base, "month", direction);
        return monthStartDate(next);
      };

      setCurrentDate((previousDate) => advanceMonth(previousDate));
      if (moveSelection) {
        setSelectedDate((previousDate) => advanceMonth(previousDate));
      }
    },
    [monthStartDate, monthStripExpanded, setCurrentDate, setSelectedDate],
  );

  const handleNavigateForward = useCallback(() => {
    navigateMonth(1, !monthStripExpanded);
  }, [navigateMonth, monthStripExpanded]);

  const handleNavigateBackward = useCallback(() => {
    navigateMonth(-1, !monthStripExpanded);
  }, [navigateMonth, monthStripExpanded]);

  const handleMonthChange = useCallback(
    (direction: 1 | -1) => {
      navigateMonth(direction, false);
    },
    [navigateMonth],
  );

  const handleTodayPress = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  }, [setCurrentDate, setSelectedDate]);

  const handleDayPress = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      setCurrentDate(date);
      setMonthStripExpanded(false);
    },
    [setCurrentDate, setSelectedDate],
  );

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
    [activeView, setCurrentDate, setSelectedDate],
  );

  const handleDetailSwipeCommit = useCallback(
    (direction: 1 | -1) => {
      setCurrentDate(navigateCalendarDate(selectedDate, activeView, direction));
    },
    [activeView, selectedDate, setCurrentDate],
  );

  const handleEventDelete = useCallback(
    (eventId: string) => {
      deleteEventMutation.mutate(eventId);
    },
    [deleteEventMutation],
  );

  const isTimelineView =
    activeView === "week" || activeView === "3day" || activeView === "day";

  const renderTimelineHeaderPage = useCallback(
    (page: TimelinePage) => (
      <CompactMonthStrip
        currentDate={page.baseDate}
        selectedDate={page.baseDate}
        highlightedDates={
          activeView === "day" || activeView === "3day" ? page.dates : undefined
        }
        collapsedRowDates={
          activeView === "3day"
            ? getThreeDayStripDates(page.baseDate)
            : activeView === "week"
              ? page.dates
              : undefined
        }
        events={decoratedMonthEvents}
        weekStartDay={settings?.weekStartDay ?? 0}
        expanded={false}
        onDayPress={handleDayPress}
        onToggleExpand={handleToggleMonthStrip}
        swipeEnabled={false}
        showSelectedDateHighlight={activeView !== "week"}
        collapseToHandleOnly={activeView === "day"}
      />
    ),
    [
      activeView,
      decoratedMonthEvents,
      handleDayPress,
      handleToggleMonthStrip,
      settings?.weekStartDay,
    ],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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

      {(monthStripExpanded || !isTimelineView) && (
        <>
          <CompactMonthStrip
            currentDate={currentDate}
            selectedDate={selectedDate}
            events={monthStripEvents}
            weekStartDay={settings?.weekStartDay ?? 0}
            expanded={monthStripExpanded}
            externalExpandControl={monthStripExpanded}
            swipeEnabled
            showHandle
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            onToggleExpand={handleToggleMonthStrip}
          />
          <View style={styles.separator} />
        </>
      )}

      {loadingState.isAllInitialLoading ? (
        <SkeletonLoader view={activeView} />
      ) : activeView === "month" ? (
        monthStripExpanded ? null : (
          <MonthGrid
            currentDate={currentDate}
            selectedDate={selectedDate}
            events={decoratedDetailEvents}
            weekStartDay={settings?.weekStartDay ?? 0}
            onDayPress={handleDayPress}
          />
        )
      ) : activeView === "agenda" ? (
        <SwipeableCalendarView
          onSwipeLeft={() => handleDetailNavigate(1)}
          onSwipeRight={() => handleDetailNavigate(-1)}
        >
          <AgendaList
            key={selectedDate.toISOString()}
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
              renderHeaderPage={
                monthStripExpanded ? undefined : renderTimelineHeaderPage
              }
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
              renderHeaderPage={
                monthStripExpanded ? undefined : renderTimelineHeaderPage
              }
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
              renderHeaderPage={
                monthStripExpanded ? undefined : renderTimelineHeaderPage
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

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
