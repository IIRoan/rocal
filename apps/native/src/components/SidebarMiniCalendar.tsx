import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  addMonths,
  differenceInCalendarMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
} from "date-fns";
import {
  buildPaddedCalendarMonthRanges,
  formatCalendarMonthKey,
  getPaddedCalendarMonthRange,
  resolveTimezone,
  type DecoratedCalendarEvent,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { QUERY_KEYS } from "../lib/query-keys";
import { calendarApiService } from "../lib/api";
import {
  MAX_DOTS,
  generateGridDates,
  getMonthDayEvents,
  getOrderedDayLabels,
  groupEventsByDay,
  resolveEventDotColor,
} from "./calendar/month-grid-utils";
import { useCurrentDateTime } from "./calendar/useCurrentDateTime";
import {
  getMiniCalendarPagerWindow,
  rubberBandPagerPosition,
  MINI_CALENDAR_WINDOW_RADIUS,
} from "./sidebar-mini-calendar-pager";
import {
  getMiniCalendarSwipeTarget,
  retainMonthEvents,
} from "./sidebar-mini-calendar-utils";

interface SidebarMiniCalendarProps {
  weekStartDay?: number;
  selectedDate?: Date;
  onDayPress?: (date: Date) => void;
  timezone?: string | null;
}

/** Release velocity (px/s) that counts as a flick. */
const VELOCITY_COMMIT = 600;
/** Seconds of flick momentum carried into the predicted landing page. */
const FLICK_MOMENTUM_SECONDS = 0.16;
/** Overscroll resistance at the window edges. */
const RUBBER_BAND_FACTOR = 0.3;
/** Settle spring for the pager (animated value is a page index). */
const PAGE_SPRING: WithSpringConfig = {
  damping: 30,
  stiffness: 320,
  mass: 0.8,
};
const MINI_CALENDAR_STALE_TIME = 1000 * 60 * 2;

interface MiniCalendarMonthPageProps {
  monthDate: Date;
  weeks: Date[][];
  eventsByDay: Map<string, DecoratedCalendarEvent[]>;
  selectedDate: Date;
  today: Date;
  onDayPress?: (date: Date) => void;
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
}

const MiniCalendarMonthPage = React.memo(function MiniCalendarMonthPage({
  monthDate,
  weeks,
  eventsByDay,
  selectedDate,
  today,
  onDayPress,
  theme,
  styles,
}: MiniCalendarMonthPageProps) {
  return (
    <View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((date) => {
            const inCurrentMonth = isSameMonth(date, monthDate);
            const isSelected = inCurrentMonth && isSameDay(date, selectedDate);
            const isCurrentDay = inCurrentMonth && isSameDay(date, today);
            const dayEvents = getMonthDayEvents(
              eventsByDay,
              date,
              inCurrentMonth,
            );

            return (
              <Pressable
                key={date.toISOString()}
                onPress={() => onDayPress?.(date)}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                style={({ pressed }) => [
                  styles.dayCell,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${format(date, "MMMM d, yyyy")}${isCurrentDay ? ", today" : ""}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.dayNumberContainer,
                    isSelected && styles.selectedDayNumberContainer,
                    isCurrentDay && styles.todayDayNumberContainer,
                    isCurrentDay &&
                      isSelected &&
                      styles.todaySelectedDayNumberContainer,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumberText,
                      !inCurrentMonth && styles.outsideMonthDayNumberText,
                      isCurrentDay && styles.todayDayNumberText,
                      isSelected && styles.selectedDayNumberText,
                    ]}
                  >
                    {format(date, "d")}
                  </Text>
                </View>

                <View style={styles.dotsRow}>
                  {dayEvents.slice(0, MAX_DOTS).map((event, index) => (
                    <View
                      key={`${event.id}-${index}`}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: isSelected
                            ? theme.colors.primaryForeground
                            : resolveEventDotColor(event.color, theme),
                        },
                      ]}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

export function SidebarMiniCalendar({
  weekStartDay = 1,
  selectedDate,
  onDayPress,
  timezone,
}: SidebarMiniCalendarProps) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = useCurrentDateTime();
  const resolvedTimezone = resolveTimezone(timezone);
  const fallbackSelectedDate = useMemo(() => new Date(), []);
  const effectiveSelectedDate = selectedDate ?? fallbackSelectedDate;

  // Absolute-coordinate pager: months are indexed on an unbounded number
  // line anchored at the month the pager mounted with. The strip position
  // (`pageIndex`) lives in the same coordinate, so committing a swipe only
  // re-centers the rendered window — the visible page keeps its native view
  // and nothing re-positions mid-flight (no wrong-month frame, no flicker).
  const [epochMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const [committedIndex, setCommittedIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(1);

  const pageWidthShared = useSharedValue(1);
  // Fractional strip position in absolute page units.
  const pageIndex = useSharedValue(0);
  // Committed index mirrored for worklets (bounds + chaining).
  const committedIndexShared = useSharedValue(0);
  // pageIndex captured when the active gesture began.
  const dragStartPageIndex = useSharedValue(0);

  const retainedEventsByMonthRef = useRef(
    new Map<string, DecoratedCalendarEvent[]>(),
  );

  const calendarMonth = useMemo(
    () => addMonths(epochMonth, committedIndex),
    [committedIndex, epochMonth],
  );
  const monthKey = formatCalendarMonthKey(calendarMonth);
  const monthKeyRef = useRef(monthKey);
  monthKeyRef.current = monthKey;

  const commitToIndex = useCallback((index: number) => {
    setCommittedIndex(index);
  }, []);

  const jumpToMonth = useCallback(
    (monthDate: Date) => {
      const index = differenceInCalendarMonths(
        startOfMonth(monthDate),
        epochMonth,
      );
      cancelAnimation(pageIndex);
      pageIndex.value = index;
      setCommittedIndex(index);
    },
    [epochMonth, pageIndex],
  );

  useEffect(() => {
    if (!selectedDate) return;
    if (formatCalendarMonthKey(selectedDate) === monthKeyRef.current) return;
    jumpToMonth(selectedDate);
  }, [jumpToMonth, selectedDate]);

  const { start: windowStartIndex, end: windowEndIndex } = useMemo(
    () => getMiniCalendarPagerWindow(committedIndex, MINI_CALENDAR_WINDOW_RADIUS),
    [committedIndex],
  );

  const monthWindow = useMemo(() => {
    const indices: number[] = [];
    for (let index = windowStartIndex; index <= windowEndIndex; index++) {
      indices.push(index);
    }

    return indices.map((absoluteIndex) => {
      const monthDate = addMonths(epochMonth, absoluteIndex);
      const range = getPaddedCalendarMonthRange(
        monthDate,
        undefined,
        resolvedTimezone,
      );

      return {
        key: formatCalendarMonthKey(monthDate),
        monthDate,
        range,
        weeks: Array.from({ length: 6 }, (_, weekIndex) =>
          generateGridDates(monthDate, weekStartDay).slice(
            weekIndex * 7,
            weekIndex * 7 + 7,
          ),
        ),
      };
    });
  }, [epochMonth, resolvedTimezone, weekStartDay, windowEndIndex, windowStartIndex]);

  const monthEventQueries = useMemo(
    () =>
      monthWindow.map(({ range }) => ({
        queryKey: QUERY_KEYS.events(
          range.start.toISOString(),
          range.end.toISOString(),
        ),
        queryFn: () => calendarApiService.getEvents(range.start, range.end),
        staleTime: MINI_CALENDAR_STALE_TIME,
      })),
    [monthWindow],
  );

  const eventQueries = useQueries({ queries: monthEventQueries });
  const secondPreviousMonthEvents = eventQueries[0]?.data;
  const previousMonthEvents = eventQueries[1]?.data;
  const currentMonthEvents = eventQueries[2]?.data;
  const nextMonthEvents = eventQueries[3]?.data;
  const secondNextMonthEvents = eventQueries[4]?.data;

  useEffect(() => {
    for (const range of buildPaddedCalendarMonthRanges(calendarMonth, {
      adjacentMonthDepth: MINI_CALENDAR_WINDOW_RADIUS + 1,
      timezone: resolvedTimezone,
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
  }, [calendarMonth, queryClient, resolvedTimezone]);

  const dayLabels = useMemo(
    () => getOrderedDayLabels(weekStartDay).map((label) => label.charAt(0)),
    [weekStartDay],
  );

  const pages = useMemo(() => {
    const queryData = [
      secondPreviousMonthEvents,
      previousMonthEvents,
      currentMonthEvents,
      nextMonthEvents,
      secondNextMonthEvents,
    ];

    return monthWindow.map((page, index) => ({
      key: page.key,
      monthDate: page.monthDate,
      weeks: page.weeks,
      eventsByDay: groupEventsByDay(
        retainMonthEvents(
          retainedEventsByMonthRef.current,
          page.key,
          queryData[index],
        ),
        resolvedTimezone,
      ),
    }));
  }, [
    currentMonthEvents,
    monthWindow,
    nextMonthEvents,
    previousMonthEvents,
    resolvedTimezone,
    secondNextMonthEvents,
    secondPreviousMonthEvents,
  ]);

  useLayoutEffect(() => {
    pageWidthShared.value = pageWidth;
    // Keep the worklet-facing committed index in lockstep with the rendered
    // window so the gesture's rubber-band bounds always match what is mounted.
    committedIndexShared.value = committedIndex;
  }, [committedIndex, committedIndexShared, pageWidth, pageWidthShared]);

  const handleGoToToday = useCallback(() => {
    const todayDate = new Date();
    if (formatCalendarMonthKey(todayDate) !== monthKeyRef.current) {
      jumpToMonth(todayDate);
    }
    onDayPress?.(todayDate);
  }, [jumpToMonth, onDayPress]);

  const stepMonth = useCallback(
    (delta: 1 | -1) => {
      const target = committedIndexShared.value + delta;
      cancelAnimation(pageIndex);
      pageIndex.value = withSpring(target, PAGE_SPRING);
      commitToIndex(target);
    },
    [commitToIndex, committedIndexShared, pageIndex],
  );

  const handlePreviousMonth = useCallback(() => {
    stepMonth(-1);
  }, [stepMonth]);

  const handleNextMonth = useCallback(() => {
    stepMonth(1);
  }, [stepMonth]);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(1, event.nativeEvent.layout.width);
    setPageWidth((previous) =>
      Math.abs(previous - nextWidth) > 0.5 ? nextWidth : previous,
    );
  }, []);

  const monthSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          "worklet";
          // Grab the strip wherever it is — even mid-settle — so the motion
          // stays with the finger instead of snapping to a page edge.
          cancelAnimation(pageIndex);
          dragStartPageIndex.value = pageIndex.value;
        })
        .onUpdate((event) => {
          "worklet";
          const width = pageWidthShared.value;
          if (width <= 1) return;
          const committed = committedIndexShared.value;
          const raw = dragStartPageIndex.value - event.translationX / width;
          pageIndex.value = rubberBandPagerPosition(
            raw,
            committed - MINI_CALENDAR_WINDOW_RADIUS,
            committed + MINI_CALENDAR_WINDOW_RADIUS,
            RUBBER_BAND_FACTOR,
          );
        })
        .onEnd((event) => {
          "worklet";
          const width = pageWidthShared.value;
          const committed = committedIndexShared.value;
          if (width <= 1) {
            pageIndex.value = withSpring(committed, PAGE_SPRING);
            return;
          }

          const target = getMiniCalendarSwipeTarget({
            startIndex: dragStartPageIndex.value,
            currentIndex: pageIndex.value,
            translationX: event.translationX,
            velocityX: event.velocityX,
            pageWidth: width,
            minIndex: committed - MINI_CALENDAR_WINDOW_RADIUS,
            maxIndex: committed + MINI_CALENDAR_WINDOW_RADIUS,
            commitVelocity: VELOCITY_COMMIT,
            momentumSeconds: FLICK_MOMENTUM_SECONDS,
          });

          // Commit at release — not when the settle animation finishes — so a
          // second swipe can chain off this one instead of dropping it. The
          // target is an absolute index, so commits are order-safe. The
          // committed-index shared value is re-synced by the layout effect
          // once the window re-renders around the new month.
          if (target !== committed) {
            scheduleOnRN(commitToIndex, target);
          }

          pageIndex.value = withSpring(target, {
            ...PAGE_SPRING,
            velocity: -event.velocityX / width,
          });
        }),
    [commitToIndex, committedIndexShared, dragStartPageIndex, pageIndex, pageWidthShared],
  );

  // The strip lays pages out in a flex row starting at x=0, but the pages
  // live at absolute month indices. `left` shifts the whole row so page
  // `windowStartIndex` sits at absolute position `windowStartIndex*width`.
  // `left` is a layout property committed by React in the same pass as the
  // page set, so the two can never disagree on a painted frame. The animated
  // transform then applies the finger/settle position on top and depends only
  // on `pageIndex`, so recycling the window never moves the strip.
  const windowOffsetPx = windowStartIndex * pageWidth;

  const pagesAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -pageIndex.value * pageWidthShared.value }],
  }));

  return (
    <View>
      <View style={styles.headerRow}>
        <Pressable
          onPress={handleGoToToday}
          style={({ pressed }) => [
            styles.headerTitleButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text>
            <Text style={styles.monthLabel}>
              {format(calendarMonth, "MMMM")}
            </Text>
            <Text
              style={styles.yearLabel}
            >{` ${format(calendarMonth, "yyyy")}`}</Text>
          </Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handlePreviousMonth}
            style={({ pressed }) => [
              styles.navButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Feather
              name="chevron-left"
              size={16}
              color={theme.colors.mutedForeground}
            />
          </Pressable>
          <Pressable
            onPress={handleNextMonth}
            style={({ pressed }) => [
              styles.navButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Feather
              name="chevron-right"
              size={16}
              color={theme.colors.mutedForeground}
            />
          </Pressable>
        </View>
      </View>

      <GestureDetector gesture={monthSwipeGesture}>
        <View collapsable={false}>
          <View style={styles.weekdaysRow}>
            {dayLabels.map((label, index) => (
              <View key={`${label}-${index}`} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.gridViewport} onLayout={handleGridLayout}>
            <View style={[styles.pagesStripOffset, { left: windowOffsetPx }]}>
              <Animated.View style={[styles.pagesStrip, pagesAnimatedStyle]}>
                {pages.map((page) => (
                  <View
                    key={page.key}
                    style={[styles.page, { width: pageWidth }]}
                  >
                    <MiniCalendarMonthPage
                      monthDate={page.monthDate}
                      weeks={page.weeks}
                      eventsByDay={page.eventsByDay}
                      selectedDate={effectiveSelectedDate}
                      today={today}
                      onDayPress={onDayPress}
                      theme={theme}
                      styles={styles}
                    />
                  </View>
                ))}
              </Animated.View>
            </View>
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const foregroundSubtle = theme.colors.foreground + "0D";
  const foregroundBorder = theme.colors.foreground + "33";
  const mutedHalf = theme.colors.mutedForeground + "80";
  const mutedThirty = theme.colors.mutedForeground + "4D";

  const view = {
    headerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginBottom: 8,
    },
    headerTitleButton: {
      flexShrink: 1,
    },
    headerActions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
    },
    navButton: {
      width: 28,
      height: 28,
      borderRadius: theme.borderRadius.lg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    weekdaysRow: {
      flexDirection: "row" as const,
      marginBottom: 2,
    },
    gridViewport: {
      overflow: "hidden" as const,
    },
    pagesStripOffset: {
      position: "relative" as const,
    },
    pagesStrip: {
      flexDirection: "row" as const,
    },
    page: {
      flexShrink: 0,
    },
    weekdayCell: {
      flex: 1,
      height: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    weekRow: {
      flexDirection: "row" as const,
    },
    dayCell: {
      flex: 1,
      aspectRatio: 1,
      alignItems: "center" as const,
      justifyContent: "flex-start" as const,
      paddingBottom: 2,
    },
    dayNumberContainer: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 0,
      borderColor: "transparent",
    },
    selectedDayNumberContainer: {
      backgroundColor: theme.colors.primaryBase,
    },
    todayDayNumberContainer: {
      backgroundColor: foregroundSubtle,
      borderWidth: 1.5,
      borderColor: foregroundBorder,
    },
    todaySelectedDayNumberContainer: {
      backgroundColor: theme.colors.primaryBase,
      borderWidth: 1.5,
      borderColor: foregroundBorder,
    },
    dotsRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 2,
      height: 6,
      marginTop: 2,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    pressed: {
      opacity: 0.7,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    monthLabel: {
      fontSize: 14,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    yearLabel: {
      fontSize: 14,
      color: theme.colors.mutedForeground,
    },
    weekdayText: {
      fontSize: 11,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: mutedHalf,
      textTransform: "uppercase" as const,
      textAlign: "center" as const,
    },
    dayNumberText: {
      fontSize: 14,
      color: theme.colors.foreground,
      fontWeight: "400" as TextStyle["fontWeight"],
      textAlign: "center" as const,
    },
    outsideMonthDayNumberText: {
      color: mutedThirty,
    },
    todayDayNumberText: {
      fontWeight: "700" as TextStyle["fontWeight"],
    },
    selectedDayNumberText: {
      color: theme.colors.primaryForeground,
      fontWeight: "600" as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { SidebarMiniCalendarProps };
