import { useCallback, useMemo, useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { isSameMonth, isSameDay, format } from "date-fns";
import { useTheme } from "../../providers/ThemeProvider";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  MAX_DOTS,
  getOrderedDayLabels,
  generateGridDates,
  groupEventsByDay,
  resolveEventDotColor,
} from "./month-grid-utils";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Height of a single week row in the strip */
const WEEK_ROW_HEIGHT = 48;
/** Height of the day-of-week header row */
const HEADER_ROW_HEIGHT = 24;
/** Height of the expand/collapse handle */
const HANDLE_HEIGHT = 24;

/** Distance (px) the finger must travel to commit to a month change. */
const SWIPE_COMMIT_THRESHOLD = 50;
/** Velocity (px/s) that also commits to a month change. */
const VELOCITY_COMMIT = 600;
/** Rubber-band factor for overscroll resistance. */
const RUBBER_BAND_FACTOR = 0.35;
/** Duration of the exit slide (ms). */
const EXIT_DURATION = 160;
/** Spring config for snap-back. */
const SNAP_SPRING = { damping: 26, stiffness: 300, mass: 0.8 };
/** Spring config for expand/collapse height animation. */
const HEIGHT_SPRING = { damping: 22, stiffness: 260, mass: 0.7 };

// ─── Props ───────────────────────────────────────────────────────────────────

interface CompactMonthStripProps {
  /** The current month being displayed */
  currentDate: Date;
  /** The currently selected date */
  selectedDate?: Date;
  /** Events for dot indicators */
  events: DecoratedCalendarEvent[];
  /** Week start day: 0 = Sunday, 1 = Monday */
  weekStartDay: number;
  /** Whether the full month grid is expanded */
  expanded: boolean;
  /** Callback when a day is tapped */
  onDayPress: (date: Date) => void;
  /** Callback when the month changes (swipe left/right on the strip) */
  onMonthChange: (direction: 1 | -1) => void;
  /** Callback to toggle expanded/collapsed state */
  onToggleExpand: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rubberBand(offset: number, limit: number, factor: number): number {
  "worklet";
  if (Math.abs(offset) < limit) return offset;
  const sign = offset < 0 ? -1 : 1;
  const overshoot = Math.abs(offset) - limit;
  return sign * (limit + overshoot * factor);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CompactMonthStrip({
  currentDate,
  selectedDate,
  events,
  weekStartDay,
  expanded,
  onDayPress,
  onMonthChange,
  onToggleExpand,
}: CompactMonthStripProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = useMemo(() => new Date(), []);
  const { width: screenWidth } = useWindowDimensions();

  const dayLabels = useMemo(
    () => getOrderedDayLabels(weekStartDay),
    [weekStartDay],
  );

  const gridDates = useMemo(
    () => generateGridDates(currentDate, weekStartDay),
    [currentDate, weekStartDay],
  );

  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  // Find which row the selected date (or today) is in
  const activeRowIndex = useMemo(() => {
    const target = selectedDate ?? today;
    for (let row = 0; row < 6; row++) {
      const rowDates = gridDates.slice(row * 7, row * 7 + 7);
      if (rowDates.some((d) => isSameDay(d, target))) {
        return row;
      }
    }
    return 0;
  }, [gridDates, selectedDate, today]);

  // ─── Animated height for expand/collapse ─────────────────────────────────

  const collapsedHeight = HEADER_ROW_HEIGHT + WEEK_ROW_HEIGHT + HANDLE_HEIGHT;
  const expandedHeight =
    HEADER_ROW_HEIGHT + WEEK_ROW_HEIGHT * 6 + HANDLE_HEIGHT;
  const animatedHeight = useSharedValue(
    expanded ? expandedHeight : collapsedHeight,
  );

  useEffect(() => {
    animatedHeight.value = withSpring(
      expanded ? expandedHeight : collapsedHeight,
      HEIGHT_SPRING,
    );
  }, [expanded, expandedHeight, collapsedHeight, animatedHeight]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    overflow: "hidden" as const,
  }));

  // ─── Horizontal pan gesture for month navigation ──────────────────────────

  const translateX = useSharedValue(0);
  const gridOpacity = useSharedValue(1);

  const handleSwipeLeft = useCallback(() => {
    onMonthChange(1);
  }, [onMonthChange]);

  const handleSwipeRight = useCallback(() => {
    onMonthChange(-1);
  }, [onMonthChange]);

  const resetPosition = useCallback(() => {
    translateX.value = 0;
    gridOpacity.value = 1;
  }, [translateX, gridOpacity]);

  const horizontalPan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      "worklet";
      translateX.value = rubberBand(
        e.translationX,
        SWIPE_COMMIT_THRESHOLD * 2,
        RUBBER_BAND_FACTOR,
      );
    })
    .onEnd((e) => {
      "worklet";
      const committedLeft =
        e.translationX < -SWIPE_COMMIT_THRESHOLD ||
        e.velocityX < -VELOCITY_COMMIT;
      const committedRight =
        e.translationX > SWIPE_COMMIT_THRESHOLD ||
        e.velocityX > VELOCITY_COMMIT;

      if (committedLeft) {
        translateX.value = withTiming(
          -screenWidth * 0.25,
          { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) {
              runOnJS(handleSwipeLeft)();
              runOnJS(resetPosition)();
            }
          },
        );
        gridOpacity.value = withTiming(0, { duration: EXIT_DURATION });
      } else if (committedRight) {
        translateX.value = withTiming(
          screenWidth * 0.25,
          { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) {
              runOnJS(handleSwipeRight)();
              runOnJS(resetPosition)();
            }
          },
        );
        gridOpacity.value = withTiming(0, { duration: EXIT_DURATION });
      } else {
        translateX.value = withSpring(0, SNAP_SPRING);
      }
    });

  // ─── Vertical pan gesture for expand/collapse ─────────────────────────────

  const VERTICAL_COMMIT = 30;

  const handleSwipeDown = useCallback(() => {
    if (!expanded) onToggleExpand();
  }, [expanded, onToggleExpand]);

  const handleSwipeUp = useCallback(() => {
    if (expanded) onToggleExpand();
  }, [expanded, onToggleExpand]);

  const verticalPan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-8, 8])
    .onEnd((e) => {
      "worklet";
      if (e.translationY > VERTICAL_COMMIT || e.velocityY > 400) {
        runOnJS(handleSwipeDown)();
      } else if (e.translationY < -VERTICAL_COMMIT || e.velocityY < -400) {
        runOnJS(handleSwipeUp)();
      }
    });

  const composedGesture = Gesture.Race(horizontalPan, verticalPan);

  const gridAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, screenWidth * 0.25],
      [1, 0.96],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateX: translateX.value }, { scale }],
      opacity: gridOpacity.value,
    };
  });

  // ─── Render a single week row ────────────────────────────────────────────

  const renderWeekRow = useCallback(
    (rowIndex: number) => {
      const rowDates = gridDates.slice(rowIndex * 7, rowIndex * 7 + 7);
      return (
        <View key={rowIndex} style={styles.weekRow}>
          {rowDates.map((date) => {
            const dateKey = format(date, "yyyy-MM-dd");
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isToday = isSameDay(date, today);
            const isSelected =
              selectedDate != null && isSameDay(date, selectedDate);
            const dayEvents = eventsByDay.get(dateKey) ?? [];

            return (
              <Pressable
                key={dateKey}
                style={styles.dayCell}
                onPress={() => onDayPress(date)}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                accessibilityRole="button"
                accessibilityLabel={`${format(date, "MMMM d, yyyy")}${isToday ? ", today" : ""}${dayEvents.length > 0 ? `, ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}` : ""}`}
              >
                <View
                  style={[
                    styles.dayNumberContainer,
                    isToday && styles.todayHighlight,
                    isSelected && !isToday && styles.selectedHighlight,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !isCurrentMonth && styles.outsideMonthText,
                      isToday && styles.todayText,
                      isSelected && !isToday && styles.selectedText,
                    ]}
                  >
                    {format(date, "d")}
                  </Text>
                </View>

                {/* Event dot indicators */}
                {dayEvents.length > 0 && (
                  <View style={styles.dotsRow}>
                    {dayEvents.slice(0, MAX_DOTS).map((event, idx) => (
                      <View
                        key={event.id ?? idx}
                        style={[
                          styles.dot,
                          {
                            backgroundColor: resolveEventDotColor(
                              event.color,
                              theme,
                            ),
                          },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      );
    },
    [
      gridDates,
      currentDate,
      today,
      selectedDate,
      eventsByDay,
      onDayPress,
      styles,
      theme,
    ],
  );

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {/* Day-of-week header labels (static — don't slide) */}
      <View style={styles.headerRow}>
        {dayLabels.map((label) => (
          <View key={label} style={styles.headerCell}>
            <Text style={styles.headerText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Swipeable grid area */}
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.gridArea, gridAnimatedStyle]}>
          {expanded
            ? Array.from({ length: 6 }, (_, i) => renderWeekRow(i))
            : renderWeekRow(activeRowIndex)}
        </Animated.View>
      </GestureDetector>

      {/* Expand/collapse handle */}
      <Pressable
        onPress={onToggleExpand}
        style={styles.handle}
        hitSlop={{ top: 8, bottom: 8 }}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? "Collapse month calendar" : "Expand month calendar"
        }
      >
        <View style={styles.handleBar} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["2"],
      zIndex: 10,
    },
    headerRow: {
      flexDirection: "row" as const,
      height: HEADER_ROW_HEIGHT,
      alignItems: "center" as const,
    },
    headerCell: {
      flex: 1,
      alignItems: "center" as const,
    },
    gridArea: {
      overflow: "hidden" as const,
    },
    weekRow: {
      flexDirection: "row" as const,
      height: WEEK_ROW_HEIGHT,
      alignItems: "center" as const,
    },
    dayCell: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: theme.spacing["1"],
    },
    dayNumberContainer: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    todayHighlight: {
      backgroundColor: theme.colors.primaryBase,
    },
    selectedHighlight: {
      backgroundColor: theme.colors.accent,
    },
    dotsRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginTop: 2,
      height: 6,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: theme.borderRadius.full,
      marginHorizontal: 1,
    },
    handle: {
      height: HANDLE_HEIGHT,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    handleBar: {
      width: 32,
      height: 4,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.border,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerText: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      textTransform: "uppercase" as const,
    },
    dayNumber: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.normal as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center" as const,
    },
    outsideMonthText: {
      color: theme.colors.mutedForeground,
    },
    todayText: {
      color: theme.colors.primaryForeground,
      fontWeight:
        theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
    },
    selectedText: {
      color: theme.colors.accentForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { CompactMonthStripProps };
