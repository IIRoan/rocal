import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  getErrorMessage,
  getPaddedCalendarMonthRange,
  parseWorkingDays,
  createCalendarMap,
  createVisibleCalendarIdSet,
  transformCalendarEvents,
  resolveCalendarLoadingState,
  resolveTimezone,
} from "@workspace/calendar-core";
import { useSheet } from "../../../src/providers/SheetProvider";
import { useCalendarView } from "../../../src/providers/CalendarViewProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import {
  optimisticallyPatchEvent,
  rollbackFromSnapshot,
} from "../../../src/lib/optimistic-events";
import { useToast } from "../../../src/providers/ToastProvider";
import {
  getSurroundingCalendarDateRange,
  getTimezoneAwareCalendarDateRange,
  navigateCalendarDate,
} from "../../../src/components/calendar/navigation-utils";
import { AppScreen } from "../../../src/components/layout";
import { CalendarTopToolbar } from "../../../src/components/calendar/CalendarTopToolbar";
import { CalendarDrawerSheet } from "../../../src/components/calendar/CalendarDrawerSheet";
import { AccountSheet } from "../../../src/components/AccountSheet";
import { CalendarBottomChrome } from "../../../src/components/calendar/CalendarBottomChrome";
import { resolveCalendarSwitcherDate } from "../../../src/components/calendar/view-switcher-utils";
import { MonthGrid } from "../../../src/components/calendar/MonthGrid";
import { SkeletonLoader } from "../../../src/components/calendar/SkeletonLoader";
import { SwipeableCalendarView } from "../../../src/components/calendar/SwipeableCalendarView";
import {
  NativeTimelineCalendar,
  type NativeTimelineCalendarHandle,
} from "../../../src/components/calendar/NativeTimelineCalendar";
import {
  isTimelineKitView,
  type KitEventMove,
} from "../../../src/components/calendar/calendar-kit-adapter";
import { AgendaList } from "../../../src/components/calendar/AgendaList";
import { mergeMonthEventResponses } from "../../../src/components/calendar/month-events-utils";
import { useWorkspaceTabHost } from "../../../src/providers/WorkspaceTabHostProvider";

export function CalendarScreen() {
  const { openEventSheet } = useSheet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    activeView,
    currentDate,
    selectedDate,
    setActiveView,
    setCurrentDate,
    setSelectedDate,
  } = useCalendarView();
  const timelineRef = useRef<NativeTimelineCalendarHandle>(null);

  const [monthStripExpanded, setMonthStripExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openAccount = useCallback(() => setAccountOpen(true), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  const { data: settings, isPending: settingsPending } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    placeholderData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof calendarApiService.getUserSettings>>
      >(QUERY_KEYS.settings()),
  });
  const settingsLoading = settingsPending && !settings;
  const resolvedTimezone = resolveTimezone(settings?.timezone);
  const workingDays = useMemo(
    () => parseWorkingDays(settings?.workingDays),
    [settings?.workingDays],
  );

  const { data: calendars, isPending: calendarsPending } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    placeholderData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof calendarApiService.getCalendars>>
      >(QUERY_KEYS.calendars()),
  });
  const calendarsLoading = calendarsPending && !calendars;

  const detailDateRange = useMemo(() => {
    const weekStartDay = settings?.weekStartDay ?? 1;

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
        timezone: resolvedTimezone,
      });
    }

    return getTimezoneAwareCalendarDateRange({
      baseDate: selectedDate,
      view: activeView,
      weekStartDay,
      timezone: resolvedTimezone,
    });
  }, [selectedDate, activeView, settings?.weekStartDay, resolvedTimezone]);

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
    () =>
      getPaddedCalendarMonthRange(previousMonth, undefined, resolvedTimezone),
    [previousMonth, resolvedTimezone],
  );
  const currentMonthRange = useMemo(
    () =>
      getPaddedCalendarMonthRange(
        monthEventsCenter,
        undefined,
        resolvedTimezone,
      ),
    [monthEventsCenter, resolvedTimezone],
  );
  const nextMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(nextMonth, undefined, resolvedTimezone),
    [nextMonth, resolvedTimezone],
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
      timezone: resolvedTimezone,
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
  }, [monthEventsCenter, queryClient, resolvedTimezone]);

  const { data: previousMonthEventsData } = useQuery({
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

  const { data: currentMonthEventsData } = useQuery({
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

  const { data: nextMonthEventsData } = useQuery({
    queryKey: QUERY_KEYS.events(
      nextMonthRange.start.toISOString(),
      nextMonthRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(nextMonthRange.start, nextMonthRange.end),
    enabled: !settingsLoading,
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (settings?.defaultView) {
      setActiveView(settings.defaultView);
    }
  }, [settings?.defaultView, setActiveView]);

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => calendarApiService.deleteEvent(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
  });

  const moveEventMutation = useMutation({
    mutationFn: ({ eventId, start, end, recurrenceEdit }: KitEventMove) => {
      if (recurrenceEdit) {
        return calendarApiService.editRecurringEvent(
          recurrenceEdit.parentEventId,
          {
            editScope: "this_only",
            occurrenceDate: recurrenceEdit.occurrenceDate,
            updates: { start, end },
          },
        );
      }

      return calendarApiService.updateEvent(eventId, {
        start,
        end,
        timezone: resolvedTimezone,
      });
    },
    onMutate: async ({ eventId, start, end }) => {
      const snapshot = await optimisticallyPatchEvent(queryClient, eventId, {
        start: new Date(start),
        end: new Date(end),
      });
      return { snapshot };
    },
    onError: (err: unknown, _vars, context) => {
      if (context?.snapshot) {
        rollbackFromSnapshot(queryClient, context.snapshot);
      }
      toast(getErrorMessage(err, "Failed to move event"), "error");
    },
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

  const isTimelineView = isTimelineKitView(activeView);

  const handleDetailNavigate = useCallback(
    (direction: 1 | -1) => {
      if (isTimelineView) {
        if (direction === 1) {
          timelineRef.current?.goToNextPage(true);
        } else {
          timelineRef.current?.goToPrevPage(true);
        }
        return;
      }
      setSelectedDate((prev) => {
        const next = navigateCalendarDate(prev, activeView, direction);
        setCurrentDate(next);
        return next;
      });
    },
    [activeView, isTimelineView, setCurrentDate, setSelectedDate],
  );

  const handleNavigateForward = useCallback(() => {
    if (isTimelineView) {
      handleDetailNavigate(1);
      return;
    }
    navigateMonth(1, !monthStripExpanded);
  }, [handleDetailNavigate, isTimelineView, monthStripExpanded, navigateMonth]);

  const handleNavigateBackward = useCallback(() => {
    if (isTimelineView) {
      handleDetailNavigate(-1);
      return;
    }
    navigateMonth(-1, !monthStripExpanded);
  }, [handleDetailNavigate, isTimelineView, monthStripExpanded, navigateMonth]);

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
    if (isTimelineView) {
      timelineRef.current?.goToDate(now, { animated: true, hourScroll: true });
    }
  }, [isTimelineView, setCurrentDate, setSelectedDate]);

  const handleDayPress = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      setCurrentDate(date);
      setMonthStripExpanded(false);
      if (isTimelineKitView(activeView)) {
        timelineRef.current?.goToDate(date, { animated: true });
      }
    },
    [activeView, setCurrentDate, setSelectedDate],
  );

  const handleToggleMonthStrip = useCallback(() => {
    setMonthStripExpanded((prev) => !prev);
  }, []);

  const handleMonthStripAnimationEnd = useCallback((expanded: boolean) => {
    if (expanded) {
      setMonthGridVisible(false);
    }
  }, []);

  const [monthGridVisible, setMonthGridVisible] = useState(true);

  useEffect(() => {
    if (!monthStripExpanded) {
      setMonthGridVisible(true);
    }
  }, [monthStripExpanded]);

  const handleEventPress = useCallback(
    (event: DecoratedCalendarEvent) => {
      openEventSheet({ type: "view", eventId: event.id });
    },
    [openEventSheet],
  );

  const handleTimelineEventPress = useCallback(
    (eventId: string) => {
      openEventSheet({ type: "view", eventId });
    },
    [openEventSheet],
  );

  const handleTimeSlotPress = useCallback(
    (slot: { date: string; hour: string }) => {
      openEventSheet({
        type: "create",
        date: slot.date,
        hour: slot.hour,
      });
    },
    [openEventSheet],
  );

  const handleTimelineDateChange = useCallback(
    (date: Date, committed: boolean) => {
      setCurrentDate(date);
      if (committed) {
        setSelectedDate(date);
      }
    },
    [setCurrentDate, setSelectedDate],
  );

  const handleEventDelete = useCallback(
    (eventId: string) => {
      deleteEventMutation.mutate(eventId);
    },
    [deleteEventMutation],
  );

  const handleTimelineEventMove = useCallback(
    async (move: KitEventMove) => {
      await moveEventMutation.mutateAsync(move);
    },
    [moveEventMutation],
  );

  const switcherDate = resolveCalendarSwitcherDate({
    view: activeView,
    currentDate,
    selectedDate,
  });

  return (
    <>
      <AppScreen
        header={
          <CalendarTopToolbar
            currentDate={switcherDate}
            timezone={resolvedTimezone}
            onOpenDrawer={openDrawer}
            onOpenAccount={openAccount}
          />
        }
        footer={
          <CalendarBottomChrome
            activeView={activeView}
            currentDate={currentDate}
            selectedDate={selectedDate}
            switcherDate={switcherDate}
            weekStartDay={settings?.weekStartDay ?? 1}
            timezone={resolvedTimezone}
            events={decoratedMonthEvents}
            monthStripExpanded={monthStripExpanded}
            showMonthStrip={!isTimelineView}
            onTodayPress={handleTodayPress}
            onForwardPress={handleNavigateForward}
            onBackwardPress={handleNavigateBackward}
            onToggleMonthStrip={handleToggleMonthStrip}
            onDayPress={handleDayPress}
            onMonthChange={handleMonthChange}
            onExpandAnimationEnd={handleMonthStripAnimationEnd}
          />
        }
      >
        {loadingState.isAllInitialLoading && !isTimelineView ? (
          <SkeletonLoader view={activeView} />
        ) : activeView === "month" ? (
          !monthStripExpanded || monthGridVisible ? (
            <MonthGrid
              currentDate={currentDate}
              selectedDate={selectedDate}
              events={decoratedDetailEvents}
              weekStartDay={settings?.weekStartDay ?? 1}
              workingDays={workingDays}
              timezone={resolvedTimezone}
              onDayPress={handleDayPress}
            />
          ) : null
        ) : activeView === "agenda" ? (
          <SwipeableCalendarView
            onSwipeLeft={() => handleDetailNavigate(1)}
            onSwipeRight={() => handleDetailNavigate(-1)}
          >
            <AgendaList
              key={selectedDate.toISOString()}
              events={decoratedDetailEvents}
              timeFormat={settings?.timeFormat ?? "12h"}
              timezone={resolvedTimezone}
              refreshing={detailEventsLoading}
              onRefresh={() => refetchDetailEvents()}
              onEventPress={handleEventPress}
              onEventDelete={handleEventDelete}
            />
          </SwipeableCalendarView>
        ) : isTimelineKitView(activeView) ? (
          <NativeTimelineCalendar
            ref={timelineRef}
            view={activeView}
            selectedDate={selectedDate}
            events={decoratedDetailEvents}
            timezone={resolvedTimezone}
            weekStartDay={settings?.weekStartDay ?? 1}
            workingDays={workingDays}
            timeFormat={settings?.timeFormat ?? "12h"}
            swipeEnabled
            isLoading={detailEventsLoading}
            onEventPress={handleTimelineEventPress}
            onTimeSlotPress={handleTimeSlotPress}
            onDateChange={handleTimelineDateChange}
            onEventMove={handleTimelineEventMove}
          />
        ) : null}
      </AppScreen>
      <CalendarDrawerSheet visible={drawerOpen} onDismiss={closeDrawer} />
      <AccountSheet
        visible={accountOpen}
        activeApp="calendar"
        onDismiss={closeAccount}
      />
    </>
  );
}

export default function CalendarRoute() {
  const { isHosted } = useWorkspaceTabHost();
  if (isHosted) {
    return null;
  }
  return <CalendarScreen />;
}
