import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { format, isSameDay } from "date-fns";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { getCalendarPageDate } from "./navigation-utils";
import {
  HOUR_HEIGHT,
  TIME_GUTTER_WIDTH,
  TOTAL_HOURS,
  calculateEventPosition,
  formatDayHeader,
  formatHourLabel,
  getEventsForDate,
  getThreeDayDates,
  getWeekDates,
  groupEventsByDate,
  resolveEventBlockColor,
} from "./timeline-utils";

type TimelineView = "day" | "3day" | "week";

interface TimelinePagerProps {
  currentDate: Date;
  events: DecoratedCalendarEvent[];
  view: TimelineView;
  weekStartDay?: number;
  timeFormat?: "12h" | "24h";
  swipeEnabled?: boolean;
  onSwipeCommit?: (direction: 1 | -1) => void;
  onNavigate?: (direction: 1 | -1) => void;
  onEventPress?: (event: DecoratedCalendarEvent) => void;
  onTimeSlotPress?: (date: Date, hour: number) => void;
}

interface TimelinePage {
  offset: -1 | 0 | 1;
  baseDate: Date;
  dates: Date[];
}

const PAGE_OFFSETS = [-1, 0, 1] as const;
const SWIPE_COMMIT_THRESHOLD = 60;
const VELOCITY_COMMIT = 720;
const PAGE_SPRING = { damping: 30, stiffness: 320, mass: 0.8 };
const PAGE_TIMING = {
  duration: 210,
  easing: Easing.out(Easing.cubic),
};

function clampDrag(offset: number, pageWidth: number): number {
  "worklet";
  return Math.max(-pageWidth, Math.min(pageWidth, offset));
}

function getTimelinePageDates(
  baseDate: Date,
  view: TimelineView,
  weekStartDay: number,
): Date[] {
  switch (view) {
    case "week":
      return getWeekDates(baseDate, weekStartDay);
    case "3day":
      return getThreeDayDates(baseDate);
    case "day":
    default:
      return [baseDate];
  }
}

export function TimelinePager({
  currentDate,
  events,
  view,
  weekStartDay = 0,
  timeFormat = "12h",
  swipeEnabled = true,
  onSwipeCommit,
  onNavigate,
  onEventPress,
  onTimeSlotPress,
}: TimelinePagerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width: windowWidth } = useWindowDimensions();
  const fallbackPageWidth = Math.max(1, windowWidth - TIME_GUTTER_WIDTH);
  const [pageWidth, setPageWidth] = useState(fallbackPageWidth);
  const translateX = useSharedValue(-fallbackPageWidth);
  const currentDateKey = currentDate.getTime();

  useLayoutEffect(() => {
    translateX.value = -pageWidth;
  }, [currentDateKey, pageWidth, translateX, view, weekStartDay]);

  const today = useMemo(() => new Date(), []);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const hourLabels = useMemo(
    () =>
      Array.from({ length: TOTAL_HOURS }, (_, hour) =>
        formatHourLabel(hour, timeFormat),
      ),
    [timeFormat],
  );

  const pages = useMemo<TimelinePage[]>(
    () =>
      PAGE_OFFSETS.map((offset) => {
        const baseDate = getCalendarPageDate(currentDate, view, offset);
        return {
          offset,
          baseDate,
          dates: getTimelinePageDates(baseDate, view, weekStartDay),
        };
      }),
    [currentDate, view, weekStartDay],
  );

  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = Math.max(1, event.nativeEvent.layout.width);
      if (Math.abs(nextWidth - pageWidth) > 0.5) {
        setPageWidth(nextWidth);
      }
    },
    [pageWidth],
  );

  const handleNavigate = useCallback(
    (direction: 1 | -1) => {
      onNavigate?.(direction);
    },
    [onNavigate],
  );

  const handleSwipeCommit = useCallback(
    (direction: 1 | -1) => {
      onSwipeCommit?.(direction);
    },
    [onSwipeCommit],
  );

  const panGesture = Gesture.Pan()
    .enabled(swipeEnabled && onNavigate != null && pageWidth > 1)
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      "worklet";
      translateX.value = -pageWidth + clampDrag(event.translationX, pageWidth);
    })
    .onEnd((event) => {
      "worklet";
      const committedLeft =
        event.translationX < -SWIPE_COMMIT_THRESHOLD ||
        event.velocityX < -VELOCITY_COMMIT;
      const committedRight =
        event.translationX > SWIPE_COMMIT_THRESHOLD ||
        event.velocityX > VELOCITY_COMMIT;

      if (committedLeft) {
        runOnJS(handleSwipeCommit)(1);
        translateX.value = withTiming(-pageWidth * 2, PAGE_TIMING, (done) => {
          if (done) {
            runOnJS(handleNavigate)(1);
          }
        });
      } else if (committedRight) {
        runOnJS(handleSwipeCommit)(-1);
        translateX.value = withTiming(0, PAGE_TIMING, (done) => {
          if (done) {
            runOnJS(handleNavigate)(-1);
          }
        });
      } else {
        translateX.value = withSpring(-pageWidth, PAGE_SPRING);
      }
    });

  const animatedStripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const renderDayColumn = useCallback(
    (date: Date) => {
      const dayEvents = getEventsForDate(date, eventsByDate);
      const isCurrentDay = isSameDay(date, today);
      const dayLabel =
        view === "day" ? format(date, "EEEE, MMM d") : formatDayHeader(date);

      return (
        <View key={format(date, "yyyy-MM-dd")} style={styles.dayColumn}>
          {Array.from({ length: TOTAL_HOURS }, (_, hour) => (
            <Pressable
              key={hour}
              style={styles.hourSlot}
              onPress={() => onTimeSlotPress?.(date, hour)}
              accessibilityRole="button"
              accessibilityLabel={`${dayLabel} ${formatHourLabel(hour, timeFormat)}`}
            >
              <View style={styles.hourDivider} />
            </Pressable>
          ))}

          {dayEvents.map((event) => {
            const position = calculateEventPosition(event, HOUR_HEIGHT);
            const colors = resolveEventBlockColor(event.color, theme);

            return (
              <Pressable
                key={event.id}
                style={[
                  styles.eventBlock,
                  {
                    top: position.top,
                    height: position.height,
                    backgroundColor: colors.bg,
                  },
                ]}
                onPress={() => onEventPress?.(event)}
                accessibilityRole="button"
                accessibilityLabel={`${event.title}, ${dayLabel}`}
              >
                <Text
                  style={[styles.eventTitle, { color: colors.fg }]}
                  numberOfLines={1}
                >
                  {event.title}
                </Text>
                {position.height >= HOUR_HEIGHT / 2 && (
                  <Text
                    style={[styles.eventTime, { color: colors.fg }]}
                    numberOfLines={1}
                  >
                    {formatHourLabel(
                      new Date(event.start).getHours(),
                      timeFormat,
                    )}
                  </Text>
                )}
              </Pressable>
            );
          })}

          {isCurrentDay && (
            <View
              style={[
                styles.nowIndicator,
                { top: nowTop },
                Platform.OS === "web"
                  ? ({ pointerEvents: "none" } as unknown as ViewStyle)
                  : null,
              ]}
              pointerEvents={Platform.OS === "web" ? undefined : "none"}
            />
          )}
        </View>
      );
    },
    [
      eventsByDate,
      nowTop,
      onEventPress,
      onTimeSlotPress,
      styles,
      theme,
      timeFormat,
      today,
      view,
    ],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.gridContainer}>
          <View style={styles.timeGutter}>
            {hourLabels.map((label, hour) => (
              <View key={hour} style={styles.hourLabelContainer}>
                <Text style={styles.hourLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.columnsViewport} onLayout={handleViewportLayout}>
            <GestureDetector gesture={panGesture}>
              <Animated.View
                style={[
                  styles.pagesStrip,
                  { width: pageWidth * PAGE_OFFSETS.length },
                  animatedStripStyle,
                ]}
              >
                {pages.map((page) => (
                  <View
                    key={`${page.offset}-${format(page.baseDate, "yyyy-MM-dd")}`}
                    style={[styles.page, { width: pageWidth }]}
                  >
                    {page.dates.map(renderDayColumn)}
                  </View>
                ))}
              </Animated.View>
            </GestureDetector>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      minHeight: TOTAL_HOURS * HOUR_HEIGHT,
    },
    gridContainer: {
      flexDirection: "row" as const,
      flex: 1,
    },
    timeGutter: {
      width: TIME_GUTTER_WIDTH,
    },
    hourLabelContainer: {
      height: HOUR_HEIGHT,
      justifyContent: "flex-start" as const,
      paddingTop: 2,
      paddingRight: theme.spacing["1"],
      alignItems: "flex-end" as const,
    },
    columnsViewport: {
      flex: 1,
      overflow: "hidden" as const,
    },
    pagesStrip: {
      flexDirection: "row" as const,
    },
    page: {
      flexDirection: "row" as const,
    },
    dayColumn: {
      flex: 1,
      position: "relative" as const,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: theme.colors.border,
    },
    hourSlot: {
      height: HOUR_HEIGHT,
    },
    hourDivider: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    eventBlock: {
      position: "absolute" as const,
      left: 1,
      right: 1,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: 2,
      paddingVertical: 1,
      overflow: "hidden" as const,
      zIndex: 2,
    },
    nowIndicator: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: "#ef4444",
      zIndex: 3,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    hourLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    eventTitle: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    eventTime: {
      fontSize: 9,
      lineHeight: 11,
      opacity: 0.8,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { TimelinePagerProps };
