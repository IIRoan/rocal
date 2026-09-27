import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { addMonths, differenceInCalendarMonths, startOfMonth } from "date-fns";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  formatCalendarDayKey,
  formatCalendarMonthKey,
  getMonthGridWeeks,
  getWeekdayLabels,
  getWorkingDayShade,
  groupEventsByCalendarDay,
  isSamePickerDay,
  resolveTimezone,
  utcToPickerDate,
  type DecoratedCalendarEvent,
  type TimeFormat,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { resolveEventBlockColor } from "../../lib/calendar-color-utils";
import { rubberBandPagerPosition } from "../sidebar-mini-calendar-pager";
import { getMiniCalendarSwipeTarget } from "../sidebar-mini-calendar-utils";
import {
  formatMonthChipTime,
  getMonthChipCapacity,
  getMonthDayChipLayout,
} from "./month-view-utils";
import { useCurrentDateTime } from "./useCurrentDateTime";

/** One month rendered on each side of the visible page. */
const MONTH_WINDOW_RADIUS = 1;
const VELOCITY_COMMIT = 600;
const FLICK_MOMENTUM_SECONDS = 0.16;
const RUBBER_BAND_FACTOR = 0.3;
const PAGE_SPRING: WithSpringConfig = { damping: 30, stiffness: 320, mass: 0.8 };
const WEEKDAY_HEADER_HEIGHT = 24;
/** Fixed anchor for absolute month page indexes. */
const PAGE_EPOCH_MONTH = new Date(2000, 0, 1);

function getMonthPageIndex(date: Date): number {
  return differenceInCalendarMonths(startOfMonth(date), PAGE_EPOCH_MONTH);
}

export type NativeMonthCalendarHandle = {
  goToNextPage: () => void;
  goToPrevPage: () => void;
};

interface NativeMonthCalendarProps {
  selectedDate: Date;
  events: DecoratedCalendarEvent[];
  timezone: string;
  weekStartDay: number;
  workingDays: readonly number[];
  timeFormat: TimeFormat;
  isLoading?: boolean;
  onDayPress: (date: Date) => void;
  onCreateAtDay: (date: Date) => void;
  onEventPress: (eventId: string) => void;
  onMonthChange: (monthDate: Date) => void;
  ref?: Ref<NativeMonthCalendarHandle>;
}

interface MonthPageModel {
  key: string;
  monthDate: Date;
  weeks: Date[][];
  eventsByDay: Map<string, DecoratedCalendarEvent[]>;
}

interface MonthPageProps {
  page: MonthPageModel;
  width: number;
  height: number;
  selectedDate: Date;
  today: Date;
  timeFormat: TimeFormat;
  timezone: string;
  workingDays: readonly number[];
  onDayPress: (date: Date) => void;
  onCreateAtDay: (date: Date) => void;
  onEventPress: (eventId: string) => void;
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
}

const MonthPage = memo(function MonthPage({
  page,
  width,
  height,
  selectedDate,
  today,
  timeFormat,
  timezone,
  workingDays,
  onDayPress,
  onCreateAtDay,
  onEventPress,
  theme,
  styles,
}: MonthPageProps) {
  const chipCapacity = getMonthChipCapacity(
    Math.floor((height - WEEKDAY_HEADER_HEIGHT) / page.weeks.length),
  );

  return (
    <View style={{ width, height }}>
      {page.weeks.map((week) => (
        <View key={formatCalendarDayKey(week[0] ?? page.monthDate)} style={styles.weekRow}>
          {week.map((day) => {
            const inMonth = day.getMonth() === page.monthDate.getMonth();
            const isToday = isSamePickerDay(day, today);
            const isSelected = inMonth && isSamePickerDay(day, selectedDate);
            const shade = inMonth
              ? getWorkingDayShade(day.getDay(), workingDays)
              : null;
            const dayEvents =
              page.eventsByDay.get(formatCalendarDayKey(day)) ?? [];
            const { visible, hiddenCount } = getMonthDayChipLayout(
              dayEvents,
              chipCapacity,
            );

            return (
              <Pressable
                key={formatCalendarDayKey(day)}
                onPress={() => onDayPress(day)}
                onLongPress={() => onCreateAtDay(day)}
                delayLongPress={400}
                style={({ pressed }) => [
                  styles.dayCell,
                  shade === "workday" && {
                    backgroundColor: theme.colors.calendarWorkday,
                  },
                  shade === "weekend" && {
                    backgroundColor: theme.colors.calendarWeekend,
                  },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${formatCalendarDayKey(day)}${isToday ? ", today" : ""}`}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.dayNumberContainer,
                    isToday && styles.todayDayNumberContainer,
                    isSelected && styles.selectedDayNumberContainer,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumberText,
                      !inMonth && styles.outsideMonthDayNumberText,
                      isToday && styles.todayDayNumberText,
                      isSelected && styles.selectedDayNumberText,
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </View>
                {visible.map((event) => {
                  const colors = resolveEventBlockColor(event.color, theme);
                  const time = formatMonthChipTime(
                    event,
                    day,
                    timeFormat,
                    timezone,
                  );
                  return (
                    <Pressable
                      key={event.id}
                      onPress={() => onEventPress(event.id)}
                      style={[styles.chip, { backgroundColor: colors.bg }]}
                      accessibilityRole="button"
                      accessibilityLabel={event.title}
                    >
                      <Text
                        style={[styles.chipText, { color: colors.fg }]}
                        numberOfLines={1}
                        allowFontScaling={false}
                      >
                        {time ? `${time}  ${event.title}` : event.title}
                      </Text>
                    </Pressable>
                  );
                })}
                {hiddenCount > 0 && (
                  <Text style={styles.moreText} numberOfLines={1}>
                    +{hiddenCount} more
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

export function NativeMonthCalendar({
  selectedDate,
  events,
  timezone,
  weekStartDay,
  workingDays,
  timeFormat,
  isLoading = false,
  onDayPress,
  onCreateAtDay,
  onEventPress,
  onMonthChange,
  ref,
}: NativeMonthCalendarProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const resolvedTimezone = resolveTimezone(timezone);
  const now = useCurrentDateTime();

  const today = useMemo(
    () => utcToPickerDate(now, resolvedTimezone),
    [now, resolvedTimezone],
  );

  const committedIndex = getMonthPageIndex(selectedDate);
  const [pageSize, setPageSize] = useState({ width: 1, height: 1 });

  const pageWidthShared = useSharedValue(1);
  const pageIndex = useSharedValue(committedIndex);
  const committedIndexShared = useSharedValue(committedIndex);
  const dragStartPageIndex = useSharedValue(committedIndex);
  // Index the pager is already animating toward, so the commit re-render doesn't snap it.
  const animatingToIndexRef = useRef<number | null>(null);

  useEffect(() => {
    committedIndexShared.value = committedIndex;
    if (animatingToIndexRef.current === committedIndex) {
      animatingToIndexRef.current = null;
      return;
    }
    cancelAnimation(pageIndex);
    pageIndex.value = committedIndex;
  }, [committedIndex, committedIndexShared, pageIndex]);

  const commitToIndex = useCallback(
    (index: number) => {
      animatingToIndexRef.current = index;
      committedIndexShared.value = index;
      onMonthChange(addMonths(selectedDate, index - committedIndex));
    },
    [committedIndex, committedIndexShared, onMonthChange, selectedDate],
  );

  const stepMonth = useCallback(
    (delta: 1 | -1) => {
      const target = committedIndexShared.value + delta;
      cancelAnimation(pageIndex);
      pageIndex.value = withSpring(target, PAGE_SPRING);
      commitToIndex(target);
    },
    [commitToIndex, committedIndexShared, pageIndex],
  );

  useImperativeHandle(
    ref,
    () => ({
      goToNextPage: () => stepMonth(1),
      goToPrevPage: () => stepMonth(-1),
    }),
    [stepMonth],
  );

  const pages = useMemo<MonthPageModel[]>(() => {
    const result: MonthPageModel[] = [];
    for (
      let index = committedIndex - MONTH_WINDOW_RADIUS;
      index <= committedIndex + MONTH_WINDOW_RADIUS;
      index++
    ) {
      const monthDate = addMonths(PAGE_EPOCH_MONTH, index);
      const weeks = getMonthGridWeeks(monthDate, weekStartDay);
      const firstWeek = weeks[0] ?? [];
      const lastWeek = weeks[weeks.length - 1] ?? [];
      result.push({
        key: formatCalendarMonthKey(monthDate),
        monthDate,
        weeks,
        eventsByDay: groupEventsByCalendarDay(
          events,
          {
            firstDay: firstWeek[0] ?? monthDate,
            lastDay: lastWeek[lastWeek.length - 1] ?? monthDate,
          },
          resolvedTimezone,
        ),
      });
    }
    return result;
  }, [committedIndex, events, resolvedTimezone, weekStartDay]);

  const dayLabels = useMemo(
    () => getWeekdayLabels(weekStartDay, "EEE"),
    [weekStartDay],
  );

  useEffect(() => {
    pageWidthShared.value = pageSize.width;
  }, [pageSize.width, pageWidthShared]);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPageSize((previous) =>
      Math.abs(previous.width - width) > 0.5 ||
      Math.abs(previous.height - height) > 0.5
        ? { width: Math.max(1, width), height: Math.max(1, height) }
        : previous,
    );
  }, []);

  const monthSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          "worklet";
          cancelAnimation(pageIndex);
          dragStartPageIndex.value = pageIndex.value;
        })
        .onUpdate((event) => {
          "worklet";
          const width = pageWidthShared.value;
          if (width <= 1) return;
          const committed = committedIndexShared.value;
          pageIndex.value = rubberBandPagerPosition(
            dragStartPageIndex.value - event.translationX / width,
            committed - MONTH_WINDOW_RADIUS,
            committed + MONTH_WINDOW_RADIUS,
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
            minIndex: committed - MONTH_WINDOW_RADIUS,
            maxIndex: committed + MONTH_WINDOW_RADIUS,
            commitVelocity: VELOCITY_COMMIT,
            momentumSeconds: FLICK_MOMENTUM_SECONDS,
          });

          if (target !== committed) {
            scheduleOnRN(commitToIndex, target);
          }

          pageIndex.value = withSpring(target, {
            ...PAGE_SPRING,
            velocity: -event.velocityX / width,
          });
        }),
    [
      commitToIndex,
      committedIndexShared,
      dragStartPageIndex,
      pageIndex,
      pageWidthShared,
    ],
  );

  const windowOffsetPx =
    (committedIndex - MONTH_WINDOW_RADIUS) * pageSize.width;
  const pagesAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -pageIndex.value * pageWidthShared.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.weekdaysRow}>
        {dayLabels.map((label, index) => (
          <View key={`${label}-${index}`} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
      </View>
      <GestureDetector gesture={monthSwipeGesture}>
        <View
          collapsable={false}
          style={styles.gridViewport}
          onLayout={handleGridLayout}
        >
          <View style={{ left: windowOffsetPx }}>
            <Animated.View style={[styles.pagesStrip, pagesAnimatedStyle]}>
              {pages.map((page) => (
                <MonthPage
                  key={page.key}
                  page={page}
                  width={pageSize.width}
                  height={pageSize.height}
                  selectedDate={selectedDate}
                  today={today}
                  timeFormat={timeFormat}
                  timezone={resolvedTimezone}
                  workingDays={workingDays}
                  onDayPress={onDayPress}
                  onCreateAtDay={onCreateAtDay}
                  onEventPress={onEventPress}
                  theme={theme}
                  styles={styles}
                />
              ))}
            </Animated.View>
          </View>
          {isLoading && events.length === 0 && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator color={theme.colors.mutedForeground} />
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const mutedHalf = theme.colors.mutedForeground + "80";
  const mutedThirty = theme.colors.mutedForeground + "4D";

  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    weekdaysRow: {
      flexDirection: "row" as const,
      height: WEEKDAY_HEADER_HEIGHT,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    weekdayCell: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    gridViewport: {
      flex: 1,
      overflow: "hidden" as const,
    },
    pagesStrip: {
      flexDirection: "row" as const,
    },
    weekRow: {
      flex: 1,
      flexDirection: "row" as const,
    },
    dayCell: {
      flex: 1,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingTop: 2,
      paddingHorizontal: 2,
      gap: 2,
    },
    dayNumberContainer: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      alignSelf: "center" as const,
    },
    todayDayNumberContainer: {
      backgroundColor: theme.colors.primaryBase,
    },
    selectedDayNumberContainer: {
      borderWidth: 1.5,
      borderColor: theme.colors.primaryBase,
    },
    chip: {
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: 4,
      height: 16,
      justifyContent: "center" as const,
    },
    pressed: {
      opacity: 0.7,
    },
    loadingOverlay: {
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    weekdayText: {
      fontSize: 11,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: mutedHalf,
      textTransform: "uppercase" as const,
      textAlign: "center" as const,
    },
    dayNumberText: {
      fontSize: 13,
      color: theme.colors.foreground,
      textAlign: "center" as const,
    },
    outsideMonthDayNumberText: {
      color: mutedThirty,
    },
    todayDayNumberText: {
      color: theme.colors.primaryForeground,
      fontWeight: "700" as TextStyle["fontWeight"],
    },
    selectedDayNumberText: {
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    chipText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "500" as TextStyle["fontWeight"],
    },
    moreText: {
      fontSize: 10,
      lineHeight: 13,
      color: theme.colors.mutedForeground,
      paddingHorizontal: 4,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { NativeMonthCalendarProps };
