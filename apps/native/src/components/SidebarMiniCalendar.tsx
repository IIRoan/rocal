import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { addMonths, format, isSameDay, isSameMonth, subMonths } from "date-fns";
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

interface SidebarMiniCalendarProps {
  weekStartDay?: number;
  selectedDate?: Date;
  onDayPress?: (date: Date) => void;
  timezone?: string | null;
}

type MiniCalendarEventsResponse = Awaited<
  ReturnType<typeof calendarApiService.getEvents>
>;

const SWIPE_COMMIT_THRESHOLD = 50;
const VELOCITY_COMMIT = 600;
const RUBBER_BAND_FACTOR = 0.3;
const PAGE_DURATION = 240;
const PAGE_EASING = Easing.out(Easing.cubic);
const PAGE_SPRING = { damping: 30, stiffness: 320, mass: 0.8 };
const MINI_CALENDAR_STALE_TIME = 1000 * 60 * 2;

function rubberBand(offset: number, limit: number, factor: number): number {
  "worklet";
  if (Math.abs(offset) < limit) return offset;

  const sign = offset < 0 ? -1 : 1;
  const overshoot = Math.abs(offset) - limit;
  return sign * (limit + overshoot * factor);
}

function decorateEvents(
  data: MiniCalendarEventsResponse | undefined,
): DecoratedCalendarEvent[] {
  if (!data) return [];

  const calendarColorById = new Map(
    data.calendars.map((calendar) => [calendar.id, calendar.color]),
  );

  return data.events.map((event) => ({
    ...event,
    color: event.color ?? calendarColorById.get(event.calendarId) ?? undefined,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    categoryId: event.categoryId ?? undefined,
    reminder: event.reminder ?? undefined,
  }));
}

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
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    selectedDate ?? new Date(),
  );
  const [pageWidth, setPageWidth] = useState(1);
  const pageWidthShared = useSharedValue(1);
  const translateX = useSharedValue(-1);

  useEffect(() => {
    if (!selectedDate) return;

    setCalendarMonth((previousMonth) =>
      isSameMonth(selectedDate, previousMonth) ? previousMonth : selectedDate,
    );
  }, [selectedDate]);

  const previousMonth = useMemo(
    () => subMonths(calendarMonth, 1),
    [calendarMonth],
  );
  const nextMonth = useMemo(() => addMonths(calendarMonth, 1), [calendarMonth]);
  const previousMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(previousMonth, undefined, resolvedTimezone),
    [previousMonth, resolvedTimezone],
  );
  const currentMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(calendarMonth, undefined, resolvedTimezone),
    [calendarMonth, resolvedTimezone],
  );
  const nextMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(nextMonth, undefined, resolvedTimezone),
    [nextMonth, resolvedTimezone],
  );

  useEffect(() => {
    for (const range of buildPaddedCalendarMonthRanges(calendarMonth, {
      adjacentMonthDepth: 2,
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

  const { data: previousMonthData } = useQuery({
    queryKey: QUERY_KEYS.events(
      previousMonthRange.start.toISOString(),
      previousMonthRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(
        previousMonthRange.start,
        previousMonthRange.end,
      ),
    staleTime: MINI_CALENDAR_STALE_TIME,
    placeholderData: keepPreviousData,
  });

  const { data: currentMonthData } = useQuery({
    queryKey: QUERY_KEYS.events(
      currentMonthRange.start.toISOString(),
      currentMonthRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(
        currentMonthRange.start,
        currentMonthRange.end,
      ),
    staleTime: MINI_CALENDAR_STALE_TIME,
    placeholderData: keepPreviousData,
  });

  const { data: nextMonthData } = useQuery({
    queryKey: QUERY_KEYS.events(
      nextMonthRange.start.toISOString(),
      nextMonthRange.end.toISOString(),
    ),
    queryFn: () =>
      calendarApiService.getEvents(nextMonthRange.start, nextMonthRange.end),
    staleTime: MINI_CALENDAR_STALE_TIME,
    placeholderData: keepPreviousData,
  });

  const dayLabels = useMemo(
    () => getOrderedDayLabels(weekStartDay).map((label) => label.charAt(0)),
    [weekStartDay],
  );

  const pages = useMemo(
    () => [
      {
        key: `prev-${formatCalendarMonthKey(previousMonth)}`,
        monthDate: previousMonth,
        weeks: Array.from({ length: 6 }, (_, index) =>
          generateGridDates(previousMonth, weekStartDay).slice(
            index * 7,
            index * 7 + 7,
          ),
        ),
        eventsByDay: groupEventsByDay(
          decorateEvents(previousMonthData),
          resolvedTimezone,
        ),
      },
      {
        key: `current-${formatCalendarMonthKey(calendarMonth)}`,
        monthDate: calendarMonth,
        weeks: Array.from({ length: 6 }, (_, index) =>
          generateGridDates(calendarMonth, weekStartDay).slice(
            index * 7,
            index * 7 + 7,
          ),
        ),
        eventsByDay: groupEventsByDay(
          decorateEvents(currentMonthData),
          resolvedTimezone,
        ),
      },
      {
        key: `next-${formatCalendarMonthKey(nextMonth)}`,
        monthDate: nextMonth,
        weeks: Array.from({ length: 6 }, (_, index) =>
          generateGridDates(nextMonth, weekStartDay).slice(
            index * 7,
            index * 7 + 7,
          ),
        ),
        eventsByDay: groupEventsByDay(
          decorateEvents(nextMonthData),
          resolvedTimezone,
        ),
      },
    ],
    [
      calendarMonth,
      currentMonthData,
      nextMonth,
      nextMonthData,
      previousMonth,
      previousMonthData,
      resolvedTimezone,
      weekStartDay,
    ],
  );

  useLayoutEffect(() => {
    pageWidthShared.value = pageWidth;
    cancelAnimation(translateX);
    translateX.value = -pageWidth;
  }, [calendarMonth, pageWidth, pageWidthShared, translateX]);

  const handleGoToToday = () => {
    const today = new Date();
    setCalendarMonth(today);
    onDayPress?.(today);
  };

  const commitMonthChange = useCallback((direction: 1 | -1) => {
    setCalendarMonth((current) => addMonths(current, direction));
  }, []);

  const commitNextMonth = useCallback(() => {
    commitMonthChange(1);
  }, [commitMonthChange]);

  const commitPreviousMonth = useCallback(() => {
    commitMonthChange(-1);
  }, [commitMonthChange]);

  const animateMonthChange = useCallback(
    (direction: 1 | -1) => {
      const width = pageWidthShared.value;
      if (width <= 1) {
        commitMonthChange(direction);
        return;
      }

      cancelAnimation(translateX);
      translateX.value = withTiming(
        direction > 0 ? -width * 2 : 0,
        { duration: PAGE_DURATION, easing: PAGE_EASING },
        (finished) => {
          if (finished) {
            scheduleOnRN(
              direction > 0 ? commitNextMonth : commitPreviousMonth,
            );
          }
        },
      );
    },
    [
      commitMonthChange,
      commitNextMonth,
      commitPreviousMonth,
      pageWidthShared,
      translateX,
    ],
  );

  const handlePreviousMonth = useCallback(() => {
    animateMonthChange(-1);
  }, [animateMonthChange]);

  const handleNextMonth = useCallback(() => {
    animateMonthChange(1);
  }, [animateMonthChange]);

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
          cancelAnimation(translateX);
        })
        .onUpdate((event) => {
          "worklet";
          const width = pageWidthShared.value;
          if (width <= 1) return;
          translateX.value =
            -width +
            rubberBand(event.translationX, width * 0.9, RUBBER_BAND_FACTOR);
        })
        .onEnd((event) => {
          "worklet";
          const width = pageWidthShared.value;
          if (width <= 1) {
            translateX.value = withSpring(-width, PAGE_SPRING);
            return;
          }

          const committedLeft =
            event.translationX < -SWIPE_COMMIT_THRESHOLD ||
            event.velocityX < -VELOCITY_COMMIT;
          const committedRight =
            event.translationX > SWIPE_COMMIT_THRESHOLD ||
            event.velocityX > VELOCITY_COMMIT;

          if (committedLeft) {
            translateX.value = withTiming(
              -width * 2,
              { duration: PAGE_DURATION, easing: PAGE_EASING },
              (finished) => {
                if (finished) {
                  scheduleOnRN(commitNextMonth);
                }
              },
            );
            return;
          }

          if (committedRight) {
            translateX.value = withTiming(
              0,
              { duration: PAGE_DURATION, easing: PAGE_EASING },
              (finished) => {
                if (finished) {
                  scheduleOnRN(commitPreviousMonth);
                }
              },
            );
            return;
          }

          translateX.value = withSpring(-width, PAGE_SPRING);
        }),
    [commitNextMonth, commitPreviousMonth, pageWidthShared, translateX],
  );

  const pagesAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const renderMonthPage = useCallback(
    (
      pageMonth: Date,
      pageWeeks: Date[][],
      pageEventsByDay: Map<string, DecoratedCalendarEvent[]>,
    ) => (
      <View>
        {pageWeeks.map((week, weekIndex) => (
          <View
            key={`${formatCalendarMonthKey(pageMonth)}-week-${weekIndex}`}
            style={styles.weekRow}
          >
            {week.map((date) => {
              const inCurrentMonth = isSameMonth(date, pageMonth);
              const isSelected =
                inCurrentMonth && isSameDay(date, effectiveSelectedDate);
              const isCurrentDay = inCurrentMonth && isSameDay(date, today);
              const dayEvents = getMonthDayEvents(
                pageEventsByDay,
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
    ),
    [effectiveSelectedDate, onDayPress, styles, theme, today],
  );

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
            <Animated.View
              style={[
                styles.pagesStrip,
                { width: pageWidth * pages.length },
                pagesAnimatedStyle,
              ]}
            >
              {pages.map((page) => (
                <View
                  key={page.key}
                  style={[styles.page, { width: pageWidth }]}
                >
                  {renderMonthPage(
                    page.monthDate,
                    page.weeks,
                    page.eventsByDay,
                  )}
                </View>
              ))}
            </Animated.View>
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
