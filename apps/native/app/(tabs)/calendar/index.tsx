import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  buildPaddedCalendarMonthRanges,
  getErrorMessage,
  parseWorkingDays,
  createCalendarMap,
  createVisibleCalendarIdSet,
  transformCalendarEvents,
  resolveTimezone,
  utcToPickerDate,
} from "@workspace/calendar-core";
import { useSheet } from "../../../src/providers/SheetProvider";
import { toNativeCalendarView } from "../../../src/lib/calendar-views";
import { useCalendarView } from "../../../src/providers/CalendarViewProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import {
  optimisticallyPatchEvent,
  readCachedEventsForRange,
  rollbackFromSnapshot,
} from "../../../src/lib/optimistic-events";
import { useToast } from "../../../src/providers/ToastProvider";
import { getSurroundingCalendarDateRange } from "../../../src/components/calendar/navigation-utils";
import { AppScreen } from "../../../src/components/layout";
import { CalendarTopToolbar } from "../../../src/components/calendar/CalendarTopToolbar";
import { CalendarDrawerSheet } from "../../../src/components/calendar/CalendarDrawerSheet";
import { AccountSheet } from "../../../src/components/AccountSheet";
import { CalendarsSheet } from "../../../src/components/calendars/CalendarsSheet";
import { CalendarBottomChrome } from "../../../src/components/calendar/CalendarBottomChrome";
import { resolveCalendarSwitcherDate } from "../../../src/components/calendar/view-switcher-utils";
import {
  NativeTimelineCalendar,
  type NativeTimelineCalendarHandle,
} from "../../../src/components/calendar/NativeTimelineCalendar";
import type { KitEventMove } from "../../../src/components/calendar/calendar-kit-adapter";
import { useWorkspaceTabHost } from "../../../src/providers/WorkspaceTabHostProvider";
import { useUserTimeFormat } from "../../../src/hooks/use-user-time-format";

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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [calendarsOpen, setCalendarsOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openAccount = useCallback(() => setAccountOpen(true), []);
  const openCalendars = useCallback(() => setCalendarsOpen(true), []);
  const closeCalendars = useCallback(() => setCalendarsOpen(false), []);
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
  const timeFormat = useUserTimeFormat();
  const workingDays = useMemo(
    () => parseWorkingDays(settings?.workingDays),
    [settings?.workingDays],
  );

  const { data: calendars } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    placeholderData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof calendarApiService.getCalendars>>
      >(QUERY_KEYS.calendars()),
  });

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

  const { data: detailEventsData, isLoading: detailEventsLoading } = useQuery({
    queryKey: QUERY_KEYS.events(
      detailDateRange.start.toISOString(),
      detailDateRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(detailDateRange.start, detailDateRange.end),
    enabled: !settingsLoading,
    initialData: detailSeed?.data,
    initialDataUpdatedAt: detailSeed?.updatedAt,
    placeholderData: keepPreviousData,
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
      setActiveView(toNativeCalendarView(settings.defaultView));
    }
  }, [settings?.defaultView, setActiveView]);

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

  const decoratedDetailEvents = useMemo(
    () =>
      transformCalendarEvents(
        detailEventsData?.events ?? [],
        calendarMap,
        visibleCalendarIds,
      ),
    [detailEventsData?.events, calendarMap, visibleCalendarIds],
  );

  const handleNavigateForward = useCallback(() => {
    timelineRef.current?.goToNextPage(true);
  }, []);

  const handleNavigateBackward = useCallback(() => {
    timelineRef.current?.goToPrevPage(true);
  }, []);

  const handleTodayPress = useCallback(() => {
    const today = utcToPickerDate(new Date(), resolvedTimezone);
    setCurrentDate(today);
    setSelectedDate(today);
    timelineRef.current?.goToDate(today, { animated: true, hourScroll: true });
  }, [resolvedTimezone, setCurrentDate, setSelectedDate]);

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
      </AppScreen>
      <CalendarDrawerSheet
        visible={drawerOpen}
        onDismiss={closeDrawer}
        onTodayPress={handleTodayPress}
      />
      <CalendarsSheet visible={calendarsOpen} onDismiss={closeCalendars} />
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
