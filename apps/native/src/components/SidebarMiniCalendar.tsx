import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { addMonths, format, isSameDay, isSameMonth, subMonths } from "date-fns";
import {
  buildPaddedCalendarMonthRanges,
  getPaddedCalendarMonthRange,
  type DecoratedCalendarEvent,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { QUERY_KEYS } from "../lib/query-keys";
import { calendarApiService } from "../lib/api";
import {
  MAX_DOTS,
  generateGridDates,
  getOrderedDayLabels,
  groupEventsByDay,
  resolveEventDotColor,
} from "./calendar/month-grid-utils";

interface SidebarMiniCalendarProps {
  weekStartDay?: number;
  selectedDate?: Date;
  onDayPress?: (date: Date) => void;
  drawerCloseGesture?: unknown;
}

type MiniCalendarEventsResponse = Awaited<
  ReturnType<typeof calendarApiService.getEvents>
>;

const SWIPE_COMMIT_THRESHOLD = 50;
const VELOCITY_COMMIT = 600;
const RUBBER_BAND_FACTOR = 0.3;
const PAGE_DURATION = 210;
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
}: SidebarMiniCalendarProps) {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = useMemo(() => new Date(), []);
  const fallbackSelectedDate = useMemo(() => new Date(), []);
  const effectiveSelectedDate = selectedDate ?? fallbackSelectedDate;
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    selectedDate ?? new Date(),
  );
  const [pageWidth, setPageWidth] = useState(1);
  const translateX = useRef(new Animated.Value(-1)).current;

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
    () => getPaddedCalendarMonthRange(previousMonth),
    [previousMonth],
  );
  const currentMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(calendarMonth),
    [calendarMonth],
  );
  const nextMonthRange = useMemo(
    () => getPaddedCalendarMonthRange(nextMonth),
    [nextMonth],
  );

  useEffect(() => {
    for (const range of buildPaddedCalendarMonthRanges(calendarMonth, {
      adjacentMonthDepth: 2,
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
  }, [calendarMonth, queryClient]);

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
        key: `prev-${format(previousMonth, "yyyy-MM")}`,
        monthDate: previousMonth,
        weeks: Array.from({ length: 6 }, (_, index) =>
          generateGridDates(previousMonth, weekStartDay).slice(
            index * 7,
            index * 7 + 7,
          ),
        ),
        eventsByDay: groupEventsByDay(decorateEvents(previousMonthData)),
      },
      {
        key: `current-${format(calendarMonth, "yyyy-MM")}`,
        monthDate: calendarMonth,
        weeks: Array.from({ length: 6 }, (_, index) =>
          generateGridDates(calendarMonth, weekStartDay).slice(
            index * 7,
            index * 7 + 7,
          ),
        ),
        eventsByDay: groupEventsByDay(decorateEvents(currentMonthData)),
      },
      {
        key: `next-${format(nextMonth, "yyyy-MM")}`,
        monthDate: nextMonth,
        weeks: Array.from({ length: 6 }, (_, index) =>
          generateGridDates(nextMonth, weekStartDay).slice(
            index * 7,
            index * 7 + 7,
          ),
        ),
        eventsByDay: groupEventsByDay(decorateEvents(nextMonthData)),
      },
    ],
    [
      calendarMonth,
      currentMonthData,
      nextMonth,
      nextMonthData,
      previousMonth,
      previousMonthData,
      weekStartDay,
    ],
  );

  useLayoutEffect(() => {
    translateX.setValue(-pageWidth);
  }, [calendarMonth, pageWidth, translateX]);

  const handleGoToToday = () => {
    const today = new Date();
    setCalendarMonth(today);
    onDayPress?.(today);
  };

  const commitMonthChange = useCallback((direction: 1 | -1) => {
    setCalendarMonth((current) => addMonths(current, direction));
  }, []);

  const animateMonthChange = useCallback(
    (direction: 1 | -1) => {
      if (pageWidth <= 1) {
        commitMonthChange(direction);
        return;
      }

      Animated.timing(translateX, {
        toValue: direction > 0 ? -pageWidth * 2 : 0,
        duration: PAGE_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          commitMonthChange(direction);
        }
      });
    },
    [commitMonthChange, pageWidth, translateX],
  );

  const handlePreviousMonth = useCallback(() => {
    translateX.stopAnimation();
    animateMonthChange(-1);
  }, [animateMonthChange, translateX]);

  const handleNextMonth = useCallback(() => {
    translateX.stopAnimation();
    animateMonthChange(1);
  }, [animateMonthChange, translateX]);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(1, event.nativeEvent.layout.width);
    setPageWidth((previous) =>
      Math.abs(previous - nextWidth) > 0.5 ? nextWidth : previous,
    );
  }, []);

  const monthSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          pageWidth > 1 &&
          Math.abs(gestureState.dx) > 12 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          translateX.setValue(
            -pageWidth +
              rubberBand(
                gestureState.dx,
                pageWidth * 0.9,
                RUBBER_BAND_FACTOR,
              ),
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          const committedLeft =
            gestureState.dx < -SWIPE_COMMIT_THRESHOLD ||
            gestureState.vx < -VELOCITY_COMMIT / 1000;
          const committedRight =
            gestureState.dx > SWIPE_COMMIT_THRESHOLD ||
            gestureState.vx > VELOCITY_COMMIT / 1000;

          if (committedLeft) {
            Animated.timing(translateX, {
              toValue: -pageWidth * 2,
              duration: PAGE_DURATION,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) {
                commitMonthChange(1);
              }
            });
            return;
          }

          if (committedRight) {
            Animated.timing(translateX, {
              toValue: 0,
              duration: PAGE_DURATION,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) {
                commitMonthChange(-1);
              }
            });
            return;
          }

          Animated.spring(translateX, {
            toValue: -pageWidth,
            ...PAGE_SPRING,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: -pageWidth,
            ...PAGE_SPRING,
            useNativeDriver: true,
          }).start();
        },
      }),
    [commitMonthChange, pageWidth, translateX],
  );

  const renderMonthPage = useCallback(
    (
      pageMonth: Date,
      pageWeeks: Date[][],
      pageEventsByDay: Map<string, DecoratedCalendarEvent[]>,
    ) => (
      <View>
        {pageWeeks.map((week, weekIndex) => (
          <View
            key={`${format(pageMonth, "yyyy-MM")}-week-${weekIndex}`}
            style={styles.weekRow}
          >
            {week.map((date) => {
              const isSelected = isSameDay(date, effectiveSelectedDate);
              const inCurrentMonth = isSameMonth(date, pageMonth);
              const isCurrentDay = isSameDay(date, today);
              const dayEvents =
                pageEventsByDay.get(format(date, "yyyy-MM-dd")) ?? [];

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

      <View {...monthSwipeResponder.panHandlers}>
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
                { transform: [{ translateX }] },
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
