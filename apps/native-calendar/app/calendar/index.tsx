import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildPaddedCalendarMonthRanges,
  parseWorkingDays,
  createCalendarMap,
  createVisibleCalendarIdSet,
  transformCalendarEvents,
  resolveTimezone,
} from "@workspace/calendar-core";
import { useSheet } from "../../src/providers/SheetProvider";
import { isTimelineCalendarView } from "../../src/lib/calendar-views";
import { useCalendarView } from "../../src/providers/CalendarViewProvider";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { readCachedEventsForRange } from "../../src/lib/optimistic-events";
import {
  useCalendarScreenCalendars,
  useCalendarScreenEvents,
  useCalendarScreenSettings,
  useMoveCalendarEvent,
} from "../../src/hooks/use-calendar-screen-queries";
import { getSurroundingCalendarDateRange } from "../../src/components/calendar/navigation-utils";
import { AppScreen } from "@workspace/native-core/components/layout";
import { CalendarTopToolbar } from "../../src/components/calendar/CalendarTopToolbar";
import { CalendarDrawerSheet } from "../../src/components/calendar/CalendarDrawerSheet";
import { CalendarAccountSheet } from "../../src/components/CalendarAccountSheet";
import { CalendarsSheet } from "../../src/components/calendars/CalendarsSheet";
import { CalendarBottomChrome } from "../../src/components/calendar/CalendarBottomChrome";
import { resolveCalendarSwitcherDate } from "../../src/components/calendar/view-switcher-utils";
import { NativeTimelineCalendar } from "../../src/components/calendar/NativeTimelineCalendar";
import { NativeMonthCalendar } from "../../src/components/calendar/NativeMonthCalendar";
import { useCalendarViewNavigation } from "../../src/components/calendar/use-calendar-view-navigation";
import { NativeAgendaView } from "../../src/components/calendar/NativeAgendaView";
import type { KitEventMove } from "../../src/components/calendar/calendar-kit-adapter";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";

export default function CalendarScreen() {
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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openAccount = useCallback(() => setAccountOpen(true), []);
  const openCalendars = useCallback(() => setCalendarsOpen(true), []);
  const closeCalendars = useCallback(() => setCalendarsOpen(false), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);

  const { data: settings, isPending: settingsPending } =
    useCalendarScreenSettings();
  const settingsLoading = settingsPending && !settings;
  const resolvedTimezone = resolveTimezone(settings?.timezone);
  const {
    timelineRef,
    monthRef,
    handleNavigateForward,
    handleNavigateBackward,
    handleTodayPress,
    handleMonthChange,
    handleMonthDayPress,
    handleMonthCreateAtDay,
  } = useCalendarViewNavigation(resolvedTimezone);
  const timeFormat = useUserTimeFormat();
  const workingDays = useMemo(
    () => parseWorkingDays(settings?.workingDays),
    [settings?.workingDays],
  );

  const { data: calendars } = useCalendarScreenCalendars();

  const detailDateRange = useMemo(
    () =>
      getSurroundingCalendarDateRange({
        currentDate: selectedDate,
        view: activeView,
        weekStartDay: settings?.weekStartDay ?? 1,
        pageRadius: 2,
        timezone: resolvedTimezone,
      }),
    [selectedDate, activeView, settings?.weekStartDay, resolvedTimezone],
  );

  // Every page change is a new range key; seeding it from prefetched months keeps it real cache data that optimistic writes reach.
  const detailSeed = useMemo(
    () =>
      readCachedEventsForRange(
        queryClient,
        detailDateRange.start,
        detailDateRange.end,
      ),
    [queryClient, detailDateRange],
  );

  const { data: detailEventsData, isLoading: detailEventsLoading } =
    useCalendarScreenEvents({
      start: detailDateRange.start,
      end: detailDateRange.end,
      enabled: !settingsLoading,
      seed: detailSeed,
    });

  useEffect(() => {
    for (const range of buildPaddedCalendarMonthRanges(currentDate, {
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
  }, [currentDate, queryClient, resolvedTimezone]);

  useEffect(() => {
    if (settings?.defaultView) {
      setActiveView(settings.defaultView);
    }
  }, [settings?.defaultView, setActiveView]);

  const moveEventMutation = useMoveCalendarEvent(resolvedTimezone);

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

  const decoratedDetailEvents = useMemo(
    () =>
      transformCalendarEvents(
        detailEventsData?.events ?? [],
        calendarMap,
        visibleCalendarIds,
      ),
    [detailEventsData?.events, calendarMap, visibleCalendarIds],
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

  const handleNewEvent = useCallback(() => {
    openEventSheet({ type: "create" });
  }, [openEventSheet]);

  const handleTimelineDateChange = useCallback(
    (date: Date, committed: boolean) => {
      setCurrentDate(date);
      if (committed) {
        setSelectedDate(date);
      }
    },
    [setCurrentDate, setSelectedDate],
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
            onOpenDrawer={openDrawer}
            onOpenCalendars={openCalendars}
            onOpenAccount={openAccount}
            onNewEvent={handleNewEvent}
          />
        }
        footer={
          <CalendarBottomChrome
            activeView={activeView}
            switcherDate={switcherDate}
            weekStartDay={settings?.weekStartDay ?? 1}
            timezone={resolvedTimezone}
            onTodayPress={handleTodayPress}
            onForwardPress={handleNavigateForward}
            onBackwardPress={handleNavigateBackward}
          />
        }
      >
        {isTimelineCalendarView(activeView) ? (
          <NativeTimelineCalendar
            ref={timelineRef}
            view={activeView}
            selectedDate={selectedDate}
            events={decoratedDetailEvents}
            timezone={resolvedTimezone}
            weekStartDay={settings?.weekStartDay ?? 1}
            workingDays={workingDays}
            timeFormat={timeFormat}
            swipeEnabled
            isLoading={detailEventsLoading}
            onEventPress={handleTimelineEventPress}
            onTimeSlotPress={handleTimeSlotPress}
            onDateChange={handleTimelineDateChange}
            onEventMove={handleTimelineEventMove}
          />
        ) : activeView === "month" ? (
          <NativeMonthCalendar
            ref={monthRef}
            selectedDate={selectedDate}
            events={decoratedDetailEvents}
            timezone={resolvedTimezone}
            weekStartDay={settings?.weekStartDay ?? 1}
            workingDays={workingDays}
            timeFormat={timeFormat}
            isLoading={detailEventsLoading}
            onDayPress={handleMonthDayPress}
            onCreateAtDay={handleMonthCreateAtDay}
            onEventPress={handleTimelineEventPress}
            onMonthChange={handleMonthChange}
          />
        ) : (
          <NativeAgendaView
            selectedDate={selectedDate}
            events={decoratedDetailEvents}
            timezone={resolvedTimezone}
            timeFormat={timeFormat}
            isLoading={detailEventsLoading}
            onEventPress={handleTimelineEventPress}
          />
        )}
      </AppScreen>
      <CalendarDrawerSheet
        visible={drawerOpen}
        onDismiss={closeDrawer}
        onTodayPress={handleTodayPress}
      />
      <CalendarsSheet visible={calendarsOpen} onDismiss={closeCalendars} />
      <CalendarAccountSheet visible={accountOpen} onDismiss={closeAccount} />
    </>
  );
}
