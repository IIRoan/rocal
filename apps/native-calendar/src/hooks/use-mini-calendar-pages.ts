import { useEffect, useMemo, useRef } from "react";
import {
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import {
  buildPaddedCalendarMonthRanges,
  formatCalendarMonthKey,
  getMonthGridWeeks,
  getPaddedCalendarMonthRange,
  groupEventsByCalendarDay,
  type Calendar,
  type DecoratedCalendarEvent,
} from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  getMiniCalendarPagerWindow,
  MINI_CALENDAR_WINDOW_RADIUS,
} from "../components/sidebar-mini-calendar-pager";
import { retainMonthEvents } from "../components/sidebar-mini-calendar-utils";

const MINI_CALENDAR_STALE_TIME = 1000 * 60 * 2;

const selectData = <TData>(results: UseQueryResult<TData>[]) =>
  results.map((result) => result.data);

interface UseMiniCalendarPagesOptions {
  epochMonth: Date;
  committedIndex: number;
  calendarMonth: Date;
  weekStartDay: number;
  timezone: string;
  calendars?: readonly Calendar[];
}

/** The mounted month pages around the committed page, with their events and the neighbours prefetched. */
export function useMiniCalendarPages({
  epochMonth,
  committedIndex,
  calendarMonth,
  weekStartDay,
  timezone,
  calendars,
}: UseMiniCalendarPagesOptions) {
  const queryClient = useQueryClient();
  const retainedEventsByMonthRef = useRef(
    new Map<string, DecoratedCalendarEvent[]>(),
  );

  const { start, end } = getMiniCalendarPagerWindow(
    committedIndex,
    MINI_CALENDAR_WINDOW_RADIUS,
  );

  const monthWindow = useMemo(
    () =>
      Array.from({ length: end - start + 1 }, (_, offset) => {
        const monthDate = addMonths(epochMonth, start + offset);
        return {
          key: formatCalendarMonthKey(monthDate),
          monthDate,
          range: getPaddedCalendarMonthRange(monthDate, undefined, timezone),
          weeks: getMonthGridWeeks(monthDate, weekStartDay, {
            fixedWeeks: true,
          }),
        };
      }),
    [end, epochMonth, start, timezone, weekStartDay],
  );

  // One query per mounted month, so paging reuses cached neighbours.
  const monthData = useQueries({
    queries: monthWindow.map(({ range }) => ({
      queryKey: QUERY_KEYS.events(
        range.start.toISOString(),
        range.end.toISOString(),
      ),
      queryFn: () => calendarApiService.getEvents(range.start, range.end),
      staleTime: MINI_CALENDAR_STALE_TIME,
    })),
    combine: selectData,
  });

  useEffect(() => {
    for (const range of buildPaddedCalendarMonthRanges(calendarMonth, {
      adjacentMonthDepth: MINI_CALENDAR_WINDOW_RADIUS + 1,
      timezone,
    })) {
      void queryClient.prefetchQuery({
        queryKey: QUERY_KEYS.events(
          range.start.toISOString(),
          range.end.toISOString(),
        ),
        queryFn: () => calendarApiService.getEvents(range.start, range.end),
        staleTime: MINI_CALENDAR_STALE_TIME,
      });
    }
  }, [calendarMonth, queryClient, timezone]);

  const pages = useMemo(
    () =>
      monthWindow.map((page, index) => ({
        key: page.key,
        monthDate: page.monthDate,
        weeks: page.weeks,
        eventsByDay: groupEventsByCalendarDay(
          retainMonthEvents(
            retainedEventsByMonthRef.current,
            page.key,
            monthData[index],
            calendars,
          ),
          {
            firstDay: startOfMonth(page.monthDate),
            lastDay: endOfMonth(page.monthDate),
          },
          timezone,
        ),
      })),
    [calendars, monthData, monthWindow, timezone],
  );

  return { pages, windowStartIndex: start };
}
