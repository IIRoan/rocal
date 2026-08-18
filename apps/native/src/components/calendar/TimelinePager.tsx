import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { format } from "date-fns";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import {
  formatCalendarDayKey,
  formatInUserTimezone,
  getZonedDateParts,
  isTodayInTimezone,
  resolveTimezone,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { getCalendarPageDate } from "./navigation-utils";
import { useCurrentDateTime } from "./useCurrentDateTime";
import {
  HOUR_HEIGHT,
  TIME_GUTTER_WIDTH,
  TOTAL_HOURS,
  calculateEventPosition,
  formatDayHeader,
  formatHourLabel,
  getAllDayEventsForDate,
  getEventsForDate,
  getThreeDayDates,
  getWeekDates,
  groupEventsByDate,
  isAllDayOrMultiDayEvent,
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
  timezone?: string;
  /** Renders one header per timeline page so it can slide with the grid. */
  renderHeaderPage?: (page: TimelinePage) => ReactNode;
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
const INITIAL_TIMELINE_HOUR = 9;
const ALL_DAY_PILL_HEIGHT = 24;

function clampDrag(offset: number, pageWidth: number): number {
  "worklet";
  return Math.max(-pageWidth, Math.min(pageWidth, offset));
}

function getTimelinePageDates(
  baseDate: Date,
  view: TimelineView,
  weekStartDay: number,
  timezone: string,
): Date[] {
  switch (view) {
    case "week":
      return getWeekDates(baseDate, weekStartDay, timezone);
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
  timezone,
  renderHeaderPage,
}: TimelinePagerProps) {
  const { theme } = useTheme();
  const isWeekView = view === "week";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width: windowWidth } = useWindowDimensions();
  const fallbackPageWidth = Math.max(1, windowWidth - TIME_GUTTER_WIDTH);
  const [pageWidth, setPageWidth] = useState(fallbackPageWidth);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasInitialScrollRef = useRef(false);
  const translateX = useSharedValue(-fallbackPageWidth);
  const currentDateKey = currentDate.getTime();

  useLayoutEffect(() => {
    translateX.value = -pageWidth;
  }, [currentDateKey, pageWidth, translateX, view, weekStartDay]);

  const today = useCurrentDateTime();
  const resolvedTimezone = resolveTimezone(timezone);
  const nowParts = getZonedDateParts(today, resolvedTimezone);
  const nowMinutes = nowParts.hours * 60 + nowParts.minutes;
  const nowTop = (nowMinutes / 60) * HOUR_HEIGHT;

  const eventsByDate = useMemo(
    () => groupEventsByDate(events, resolvedTimezone),
    [events, resolvedTimezone],
  );
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
          dates: getTimelinePageDates(
            baseDate,
            view,
            weekStartDay,
            resolvedTimezone,
          ),
        };
      }),
    [currentDate, resolvedTimezone, view, weekStartDay],
  );

  const allDayEventsByPage = useMemo(
    () =>
      pages.map((page) =>
        page.dates.map((date) =>
          getAllDayEventsForDate(date, events, resolvedTimezone),
        ),
      ),
    [events, pages, resolvedTimezone],
  );
  const hasAllDayEvents = useMemo(
    () =>
      allDayEventsByPage.some((page) =>
        page.some((dateEvents) => dateEvents.length > 0),
      ),
    [allDayEventsByPage],
  );
  const allDayMinHeight = useMemo(() => {
    const maxRows = Math.max(
      1,
      ...allDayEventsByPage.flatMap((page) =>
        page.map((dateEvents) => dateEvents.length),
      ),
    );

    return maxRows * ALL_DAY_PILL_HEIGHT;
  }, [allDayEventsByPage]);

  useEffect(() => {
    hasInitialScrollRef.current = false;
  }, [currentDateKey, pageWidth, view, weekStartDay]);

  useEffect(() => {
    if (pageWidth <= 1 || hasInitialScrollRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: INITIAL_TIMELINE_HOUR * HOUR_HEIGHT,
        animated: false,
      });
      hasInitialScrollRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [currentDateKey, pageWidth, view, weekStartDay]);

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
        scheduleOnRN(handleSwipeCommit, 1);
        translateX.value = withTiming(-pageWidth * 2, PAGE_TIMING, () => {
          scheduleOnRN(handleNavigate, 1);
        });
      } else if (committedRight) {
        scheduleOnRN(handleSwipeCommit, -1);
        translateX.value = withTiming(0, PAGE_TIMING, () => {
          scheduleOnRN(handleNavigate, -1);
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
      const dayEvents = getEventsForDate(
        date,
        eventsByDate,
        resolvedTimezone,
      ).filter(
        (event) => !isAllDayOrMultiDayEvent(event, resolvedTimezone),
      );
      const isCurrentDay = isTodayInTimezone(date, resolvedTimezone);
      const dayLabel =
        view === "day" ? format(date, "EEEE, MMM d") : formatDayHeader(date);

      return (
        <View key={formatCalendarDayKey(date)} style={styles.dayColumn}>
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
            const position = calculateEventPosition(
              event,
              HOUR_HEIGHT,
              resolvedTimezone,
            );
            const colors = resolveEventBlockColor(event.color, theme);

            return (
              <Pressable
                key={event.id}
                style={[
                  styles.eventBlock,
                  isWeekView ? styles.eventBlockWeek : null,
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
                  style={[
                    styles.eventTitle,
                    isWeekView ? styles.eventTitleWeek : null,
                    { color: colors.fg },
                  ]}
                  numberOfLines={isWeekView ? 2 : 1}
                >
                  {event.title}
                </Text>
                {!isWeekView && position.height >= HOUR_HEIGHT / 2 && (
                  <Text
                    style={[styles.eventTime, { color: colors.fg }]}
                    numberOfLines={1}
                  >
                    {formatInUserTimezone(
                      new Date(event.start),
                      resolvedTimezone,
                      timeFormat === "24h" ? "HH:mm" : "haaa",
                    ).toLowerCase()}
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
      isWeekView,
      styles,
      theme,
      timeFormat,
      resolvedTimezone,
      view,
    ],
  );

  const renderAllDayPage = useCallback(
    (page: TimelinePage, pageIndex: number) => (
      <View
        key={`all-day-${page.offset}-${formatCalendarDayKey(page.baseDate)}`}
        style={[styles.allDayPage, { width: pageWidth }]}
      >
        {page.dates.map((date, dateIndex) => {
          const dateEvents = allDayEventsByPage[pageIndex]?.[dateIndex] ?? [];

          return (
            <View
              key={`all-day-column-${formatCalendarDayKey(date)}`}
              style={styles.allDayColumn}
            >
              <View
                style={[
                  styles.allDayColumnStack,
                  { minHeight: allDayMinHeight },
                ]}
              >
                {dateEvents.map((event) => {
                  const colors = resolveEventBlockColor(event.color, theme);
                  const dayLabel =
                    view === "day"
                      ? format(date, "EEEE, MMM d")
                      : formatDayHeader(date);

                  return (
                    <Pressable
                      key={`${event.id}-${formatCalendarDayKey(date)}`}
                      style={[
                        styles.allDayPill,
                        isWeekView ? styles.allDayPillWeek : null,
                        {
                          backgroundColor: colors.bg,
                          borderColor: colors.bg,
                        },
                      ]}
                      onPress={() => onEventPress?.(event)}
                      accessibilityRole="button"
                      accessibilityLabel={`${event.title}, all-day on ${dayLabel}`}
                    >
                      <Text
                        style={[
                          styles.allDayPillText,
                          isWeekView ? styles.allDayPillTextWeek : null,
                          { color: colors.fg },
                        ]}
                        numberOfLines={isWeekView ? 2 : 1}
                      >
                        {event.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    ),
    [
      allDayEventsByPage,
      allDayMinHeight,
      onEventPress,
      pageWidth,
      isWeekView,
      styles,
      theme,
      view,
    ],
  );

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.pagerShell}>
          {renderHeaderPage != null && (
            <View style={styles.headerRow}>
              <View style={styles.headerGutter} />
              <View
                style={styles.headerViewport}
                onLayout={handleViewportLayout}
              >
                <Animated.View
                  style={[
                    styles.pagesStrip,
                    { width: pageWidth * PAGE_OFFSETS.length },
                    animatedStripStyle,
                  ]}
                >
                  {pages.map((page) => (
                    <View
                      key={`hdr-${page.offset}-${formatCalendarDayKey(page.baseDate)}`}
                      style={[styles.headerPage, { width: pageWidth }]}
                    >
                      {renderHeaderPage(page)}
                    </View>
                  ))}
                </Animated.View>
              </View>
            </View>
          )}

          {hasAllDayEvents && (
            <View style={styles.allDayRow}>
              <View style={styles.allDayGutter}>
                <Text style={styles.allDayLabel}>All-day</Text>
              </View>
              <View style={styles.allDayViewport}>
                <Animated.View
                  style={[
                    styles.pagesStrip,
                    { width: pageWidth * PAGE_OFFSETS.length },
                    animatedStripStyle,
                  ]}
                >
                  {pages.map(renderAllDayPage)}
                </Animated.View>
              </View>
            </View>
          )}

          <ScrollView
            ref={scrollViewRef}
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

              <View
                style={styles.columnsViewport}
                onLayout={handleViewportLayout}
              >
                <Animated.View
                  style={[
                    styles.pagesStrip,
                    { width: pageWidth * PAGE_OFFSETS.length },
                    animatedStripStyle,
                  ]}
                >
                  {pages.map((page) => (
                    <View
                      key={`${page.offset}-${formatCalendarDayKey(page.baseDate)}`}
                      style={[styles.page, { width: pageWidth }]}
                    >
                      {page.dates.map(renderDayColumn)}
                    </View>
                  ))}
                </Animated.View>
              </View>
            </View>
          </ScrollView>
        </View>
      </GestureDetector>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    pagerShell: {
      flex: 1,
    },
    headerRow: {
      flexDirection: "row" as const,
      backgroundColor: theme.colors.background,
    },
    headerGutter: {
      width: TIME_GUTTER_WIDTH,
    },
    headerViewport: {
      flex: 1,
      overflow: "hidden" as const,
    },
    allDayRow: {
      flexDirection: "row" as const,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    allDayGutter: {
      width: TIME_GUTTER_WIDTH,
      paddingTop: theme.spacing["1"],
      paddingRight: theme.spacing["1"],
      alignItems: "flex-end" as const,
    },
    allDayViewport: {
      flex: 1,
      overflow: "hidden" as const,
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
    headerPage: {
      backgroundColor: theme.colors.background,
    },
    allDayPage: {
      flexDirection: "row" as const,
      paddingVertical: theme.spacing["1"],
      backgroundColor: theme.colors.background,
    },
    allDayColumn: {
      flex: 1,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: theme.colors.border,
      paddingHorizontal: theme.spacing["1"],
    },
    allDayColumnStack: {
      gap: theme.spacing["1"],
    },
    allDayPill: {
      minHeight: ALL_DAY_PILL_HEIGHT - 2,
      borderRadius: theme.borderRadius.sm,
      borderWidth: 1,
      justifyContent: "center" as const,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: 3,
      overflow: "hidden" as const,
    },
    allDayPillWeek: {
      minHeight: ALL_DAY_PILL_HEIGHT + 8,
      justifyContent: "flex-start" as const,
      paddingHorizontal: theme.spacing["1"],
      paddingVertical: 4,
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
    eventBlockWeek: {
      paddingHorizontal: 1,
      paddingTop: 2,
      paddingBottom: 2,
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
    allDayLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    allDayPillText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    allDayPillTextWeek: {
      lineHeight: 11,
    },
    eventTitle: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    eventTitleWeek: {
      lineHeight: 11,
    },
    eventTime: {
      fontSize: 9,
      lineHeight: 11,
      opacity: 0.8,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { TimelinePage, TimelinePagerProps };
