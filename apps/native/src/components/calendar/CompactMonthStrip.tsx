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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { addMonths, format, isSameDay, isSameMonth } from "date-fns";
import { useTheme } from "../../providers/ThemeProvider";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  MAX_DOTS,
  COMPACT_STRIP_EXPANDED_WEEK_ROWS,
  getOrderedDayLabels,
  generateGridDates,
  getCompactStripWeekRowOffset,
  getMonthDayEvents,
  groupEventsByDay,
  resolveEventDotColor,
} from "./month-grid-utils";
import { useCurrentDateTime } from "./useCurrentDateTime";
import { useSwipePanelGesture } from "../../lib/useSwipePanelGesture";

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
const RUBBER_BAND_FACTOR = 0.3;
/** Spring config for expand/collapse height animation. */
const HEIGHT_SPRING = {
  damping: 26,
  stiffness: 340,
  mass: 0.75,
  overshootClamping: true,
};
const VERTICAL_COMMIT_DISTANCE = 22;
const VERTICAL_VELOCITY_COMMIT = 360;
/** Duration of the month page settle animation (ms). */
const PAGE_DURATION = 240;
const PAGE_EASING = Easing.out(Easing.cubic);
/** Toolbar-driven expand/collapse (ms). */
const EXPAND_TIMING_MS = 260;
/** Spring config for snap-back after an uncommitted swipe. */
const PAGE_SPRING = { damping: 30, stiffness: 320, mass: 0.8 };

function rubberBand(offset: number, limit: number, factor: number): number {
  "worklet";
  if (Math.abs(offset) < limit) return offset;
  const sign = offset < 0 ? -1 : 1;
  const overshoot = Math.abs(offset) - limit;
  return sign * (limit + overshoot * factor);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEventsByDay(
  events: DecoratedCalendarEvent[],
  monthDate: Date,
): Map<string, DecoratedCalendarEvent[]> {
  const filtered = events.filter((event) =>
    isSameMonth(new Date(event.start), monthDate),
  );
  return groupEventsByDay(filtered);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface CompactMonthStripProps {
  /** The current month being displayed */
  currentDate: Date;
  /** The currently selected date */
  selectedDate?: Date;
  /** Dates currently visible in the timeline that should be highlighted. */
  highlightedDates?: Date[];
  /** Optional custom 7-day collapsed row for integrated timeline headers. */
  collapsedRowDates?: Date[];
  /** Events for dot indicators */
  events: DecoratedCalendarEvent[];
  /** Week start day: 0 = Sunday, 1 = Monday */
  weekStartDay: number;
  /** Whether the full month grid is expanded */
  expanded: boolean;
  /** Callback when a day is tapped */
  onDayPress: (date: Date) => void;
  /** Callback when the month changes (swipe left/right on the strip) */
  onMonthChange?: (direction: 1 | -1) => void;
  /** Callback to toggle expanded/collapsed state */
  onToggleExpand: () => void;
  /** Whether the strip owns horizontal month paging. */
  swipeEnabled?: boolean;
  /** Whether the selected date should be visually highlighted. */
  showSelectedDateHighlight?: boolean;
  /**
   * When true the strip collapses to just the drag handle — no day-label
   * header or week row is shown.
   */
  collapseToHandleOnly?: boolean;
  /** When false, no drag handle (toolbar toggles expand). Default true. */
  showHandle?: boolean;
  /** S M T W … row above the grid. Off for toolbar-expanded month picker. */
  showDayOfWeekHeader?: boolean;
  /** Flush under {@link CalendarScreenHeader} — shared border, tight padding. */
  embeddedInHeader?: boolean;
  /**
   * Toolbar (or parent) owns expand/collapse — skip drag-to-expand on the grid
   * and drive height from the `expanded` prop with a short timing animation.
   */
  externalExpandControl?: boolean;
}

function getMonthRowTarget(
  monthDate: Date,
  selectedDate: Date | undefined,
  highlightedDates: Date[] | undefined,
  today: Date,
): Date {
  if (selectedDate != null && isSameMonth(selectedDate, monthDate)) {
    return selectedDate;
  }
  const highlightedDate = highlightedDates?.find((date) =>
    isSameMonth(date, monthDate),
  );
  if (highlightedDate != null) {
    return highlightedDate;
  }
  if (isSameMonth(today, monthDate)) {
    return today;
  }
  return monthDate;
}

function getActiveRowIndexForMonth(
  monthDate: Date,
  gridDates: Date[],
  selectedDate: Date | undefined,
  highlightedDates: Date[] | undefined,
  today: Date,
): number {
  const target = getMonthRowTarget(
    monthDate,
    selectedDate,
    highlightedDates,
    today,
  );

  for (let row = 0; row < 6; row++) {
    const rowDates = gridDates.slice(row * 7, row * 7 + 7);
    if (rowDates.some((date) => isSameDay(date, target))) {
      return row;
    }
  }

  return 0;
}

interface MonthPageProps {
  monthDate: Date;
  gridDates: Date[];
  selectedDate?: Date;
  highlightedDates?: Date[];
  collapsedRowDates?: Date[];
  today: Date;
  eventsByDay: Map<string, DecoratedCalendarEvent[]>;
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
  showExpandedRows: boolean;
  animatedContentHeight: SharedValue<number>;
  collapsedContentHeight: number;
  expandedContentHeight: number;
  onDayPress: (date: Date) => void;
  showSelectedDateHighlight: boolean;
  weekStartDay: number;
}

const MonthPage = React.memo(function MonthPage({
  monthDate,
  gridDates,
  selectedDate,
  highlightedDates,
  collapsedRowDates,
  today,
  eventsByDay,
  theme,
  styles,
  showExpandedRows,
  animatedContentHeight,
  collapsedContentHeight,
  expandedContentHeight,
  onDayPress,
  showSelectedDateHighlight,
  weekStartDay,
}: MonthPageProps) {
  const expandedWeekRowOffset = useMemo(
    () => getCompactStripWeekRowOffset(monthDate, weekStartDay),
    [monthDate, weekStartDay],
  );
  const activeRowIndex = useMemo(
    () =>
      getActiveRowIndexForMonth(
        monthDate,
        gridDates,
        selectedDate,
        highlightedDates,
        today,
      ),
    [gridDates, highlightedDates, monthDate, selectedDate, today],
  );
  const collapsedGridTranslateY = -activeRowIndex * WEEK_ROW_HEIGHT;

  const pageAnimatedStyle = useAnimatedStyle(() => {
    const revealProgress = interpolate(
      animatedContentHeight.value,
      [collapsedContentHeight, expandedContentHeight],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        {
          translateY: showExpandedRows
            ? collapsedGridTranslateY * (1 - revealProgress)
            : 0,
        },
      ],
    };
  }, [
    animatedContentHeight,
    collapsedContentHeight,
    collapsedGridTranslateY,
    expandedContentHeight,
    showExpandedRows,
  ]);

  const renderDatesRow = useCallback(
    (rowDates: Date[], key: string | number) => {
      return (
        <View key={key} style={styles.weekRow}>
          {rowDates.map((date) => {
            const dateKey = format(date, "yyyy-MM-dd");
            const isCurrentMonth = isSameMonth(date, monthDate);
            const isToday = isCurrentMonth && isSameDay(date, today);
            const isSelected =
              isCurrentMonth &&
              selectedDate != null &&
              isSameDay(date, selectedDate);
            const isHighlighted =
              isCurrentMonth &&
              (highlightedDates?.some((highlightedDate) =>
                isSameDay(date, highlightedDate),
              ) ??
                false);
            const dayEvents = getMonthDayEvents(
              eventsByDay,
              date,
              isCurrentMonth,
            );

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
                    !isToday &&
                      ((showSelectedDateHighlight && isSelected) ||
                        isHighlighted) &&
                      styles.selectedHighlight,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      !isCurrentMonth && styles.outsideMonthText,
                      isToday && styles.todayText,
                      !isToday &&
                        ((showSelectedDateHighlight && isSelected) ||
                          isHighlighted) &&
                        styles.selectedText,
                    ]}
                  >
                    {format(date, "d")}
                  </Text>
                </View>

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
              </Pressable>
            );
          })}
        </View>
      );
    },
    [
      eventsByDay,
      highlightedDates,
      monthDate,
      onDayPress,
      selectedDate,
      showSelectedDateHighlight,
      styles,
      theme,
      today,
    ],
  );

  return (
    <Animated.View style={[styles.monthPageContent, pageAnimatedStyle]}>
      {showExpandedRows
        ? Array.from(
            { length: COMPACT_STRIP_EXPANDED_WEEK_ROWS },
            (_, index) => {
              const rowIndex = expandedWeekRowOffset + index;
              return renderDatesRow(
                gridDates.slice(rowIndex * 7, rowIndex * 7 + 7),
                rowIndex,
              );
            },
          )
        : collapsedRowDates != null
          ? renderDatesRow(collapsedRowDates, "collapsed-custom")
          : renderDatesRow(
              gridDates.slice(activeRowIndex * 7, activeRowIndex * 7 + 7),
              activeRowIndex,
            )}
    </Animated.View>
  );
});

// ─── Component ───────────────────────────────────────────────────────────────

function CompactMonthStripComponent({
  currentDate,
  selectedDate,
  highlightedDates,
  collapsedRowDates,
  events,
  weekStartDay,
  expanded,
  onDayPress,
  onMonthChange,
  onToggleExpand,
  swipeEnabled = true,
  showSelectedDateHighlight = true,
  collapseToHandleOnly = false,
  showHandle = true,
  showDayOfWeekHeader = true,
  embeddedInHeader = false,
  externalExpandControl = false,
}: CompactMonthStripProps) {
  const { theme } = useTheme();
  const styles = useMemo(
    () => createStyles(theme, embeddedInHeader),
    [theme, embeddedInHeader],
  );
  const dayHeaderHeight = showDayOfWeekHeader ? HEADER_ROW_HEIGHT : 0;
  const today = useCurrentDateTime();

  const dayLabels = useMemo(
    () => getOrderedDayLabels(weekStartDay),
    [weekStartDay],
  );
  const [pagedMonth, setPagedMonth] = useState(() => monthStart(currentDate));
  const carouselMonth = swipeEnabled ? pagedMonth : currentDate;
  const parentMonthKey = format(currentDate, "yyyy-MM");
  const skipParentMonthSyncRef = useRef(false);
  const pendingMonthCommitRef = useRef<1 | -1 | null>(null);

  useEffect(() => {
    if (!swipeEnabled) {
      setPagedMonth(monthStart(currentDate));
      return;
    }
    if (skipParentMonthSyncRef.current) {
      skipParentMonthSyncRef.current = false;
      return;
    }
    setPagedMonth(monthStart(currentDate));
  }, [parentMonthKey, swipeEnabled, currentDate]);

  const pages = useMemo(() => {
    if (!swipeEnabled) {
      return [
        {
          key: format(currentDate, "yyyy-MM"),
          monthDate: currentDate,
          gridDates: generateGridDates(currentDate, weekStartDay),
          eventsByDay: monthEventsByDay(events, currentDate),
        },
      ];
    }

    return [-1, 0, 1].map((offset) => {
      const monthDate = addMonths(carouselMonth, offset);
      return {
        key: String(offset),
        monthDate,
        gridDates: generateGridDates(monthDate, weekStartDay),
        eventsByDay: monthEventsByDay(events, monthDate),
      };
    });
  }, [carouselMonth, currentDate, events, swipeEnabled, weekStartDay]);

  // ─── Animated height for expand/collapse ─────────────────────────────────

  // When collapseToHandleOnly is true the content area is 0 when collapsed —
  // the parent timeline header already renders the day columns.
  const collapsedContentHeight = collapseToHandleOnly
    ? 0
    : dayHeaderHeight + WEEK_ROW_HEIGHT;
  const expandedContentHeight =
    dayHeaderHeight + WEEK_ROW_HEIGHT * COMPACT_STRIP_EXPANDED_WEEK_ROWS;
  const animatedContentHeight = useSharedValue(
    expanded ? expandedContentHeight : collapsedContentHeight,
  );
  const [showExpandedRows, setShowExpandedRows] = useState(expanded);
  const expandAnimationSessionRef = useRef(0);

  useEffect(() => {
    cancelAnimation(animatedContentHeight);
    const target = expanded ? expandedContentHeight : collapsedContentHeight;
    const session = ++expandAnimationSessionRef.current;

    if (expanded) {
      setShowExpandedRows(true);
    }

    if (embeddedInHeader && expanded) {
      animatedContentHeight.value = target;
      return;
    }

    if (expanded) {
      if (externalExpandControl) {
        animatedContentHeight.value = withTiming(target, {
          duration: EXPAND_TIMING_MS,
        });
      } else {
        animatedContentHeight.value = withSpring(target, HEIGHT_SPRING);
      }
      return;
    }

    const onCollapseFinished = (finished?: boolean) => {
      if (finished && expandAnimationSessionRef.current === session) {
        runOnJS(setShowExpandedRows)(false);
      }
    };

    if (externalExpandControl) {
      animatedContentHeight.value = withTiming(
        target,
        { duration: EXPAND_TIMING_MS },
        onCollapseFinished,
      );
    } else {
      animatedContentHeight.value = withSpring(
        target,
        HEIGHT_SPRING,
        onCollapseFinished,
      );
    }
  }, [
    expanded,
    expandedContentHeight,
    collapsedContentHeight,
    animatedContentHeight,
    embeddedInHeader,
    externalExpandControl,
  ]);

  const contentAreaAnimatedStyle = useAnimatedStyle(() => ({
    height: animatedContentHeight.value,
  }));

  // ─── Horizontal pan gesture for month navigation ──────────────────────────

  const [pageWidth, setPageWidth] = useState(1);
  const pageWidthShared = useSharedValue(1);
  const translateX = useSharedValue(-1);

  const carouselCenterKey = swipeEnabled
    ? format(pagedMonth, "yyyy-MM")
    : parentMonthKey;

  useLayoutEffect(() => {
    pageWidthShared.value = pageWidth;
    if (!swipeEnabled) {
      translateX.value = 0;
      return;
    }
    if (pageWidth > 1) {
      cancelAnimation(translateX);
      translateX.value = -pageWidth;
    }

    const pendingDirection = pendingMonthCommitRef.current;
    if (pendingDirection != null) {
      pendingMonthCommitRef.current = null;
      onMonthChange?.(pendingDirection);
    }
  }, [
    carouselCenterKey,
    onMonthChange,
    pageWidth,
    pageWidthShared,
    swipeEnabled,
    translateX,
  ]);

  const commitMonthNavigation = useCallback((direction: 1 | -1) => {
    skipParentMonthSyncRef.current = true;
    pendingMonthCommitRef.current = direction;
    setPagedMonth((prev) => monthStart(addMonths(prev, direction)));
  }, []);

  const handleNavigateLeft = useCallback(() => {
    commitMonthNavigation(1);
  }, [commitMonthNavigation]);

  const handleNavigateRight = useCallback(() => {
    commitMonthNavigation(-1);
  }, [commitMonthNavigation]);

  const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(1, event.nativeEvent.layout.width);
    setPageWidth((previous) =>
      Math.abs(previous - nextWidth) > 0.5 ? nextWidth : previous,
    );
  }, []);

  const horizontalPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(swipeEnabled && onMonthChange != null)
        .activeOffsetX([-12, 12])
        .failOffsetY([-8, 8])
        .onBegin(() => {
          "worklet";
          cancelAnimation(translateX);
        })
        .onUpdate((e) => {
          "worklet";
          const width = pageWidthShared.value;
          if (width <= 1) return;
          translateX.value =
            -width +
            rubberBand(e.translationX, width * 0.9, RUBBER_BAND_FACTOR);
        })
        .onEnd((e) => {
          "worklet";
          const width = pageWidthShared.value;
          if (width <= 1) {
            translateX.value = withSpring(-width, PAGE_SPRING);
            return;
          }

          const committedLeft =
            e.translationX < -SWIPE_COMMIT_THRESHOLD ||
            e.velocityX < -VELOCITY_COMMIT;
          const committedRight =
            e.translationX > SWIPE_COMMIT_THRESHOLD ||
            e.velocityX > VELOCITY_COMMIT;

          if (committedLeft) {
            translateX.value = withTiming(
              -width * 2,
              { duration: PAGE_DURATION, easing: PAGE_EASING },
              (finished) => {
                if (finished) {
                  runOnJS(handleNavigateLeft)();
                }
              },
            );
          } else if (committedRight) {
            translateX.value = withTiming(
              0,
              { duration: PAGE_DURATION, easing: PAGE_EASING },
              (finished) => {
                if (finished) {
                  runOnJS(handleNavigateRight)();
                }
              },
            );
          } else {
            translateX.value = withSpring(-width, PAGE_SPRING);
          }
        }),
    [
      handleNavigateLeft,
      handleNavigateRight,
      onMonthChange,
      pageWidthShared,
      swipeEnabled,
      translateX,
    ],
  );

  const stripAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // ─── Vertical pan gesture for expand/collapse ─────────────────────────────

  const allowGridDragToExpand = !externalExpandControl && !embeddedInHeader;

  const verticalPanConfig = useMemo(
    () => ({
      restValue: expanded ? expandedContentHeight : collapsedContentHeight,
      lowerBound: collapsedContentHeight,
      upperBound: expandedContentHeight,
      onCommitDown:
        allowGridDragToExpand && !expanded ? onToggleExpand : undefined,
      onCommitUp:
        allowGridDragToExpand && expanded ? onToggleExpand : undefined,
      commitDistance: VERTICAL_COMMIT_DISTANCE,
      commitVelocity: VERTICAL_VELOCITY_COMMIT,
      rubberBandBelow: RUBBER_BAND_FACTOR,
      rubberBandAbove: RUBBER_BAND_FACTOR,
      springConfig: HEIGHT_SPRING,
    }),
    [
      allowGridDragToExpand,
      collapsedContentHeight,
      expanded,
      expandedContentHeight,
      onToggleExpand,
    ],
  );

  const verticalPan = useSwipePanelGesture(
    animatedContentHeight,
    verticalPanConfig,
  )
    .activeOffsetY([-6, 6])
    .failOffsetX([-10, 10]);

  const handleVerticalPanConfig = useMemo(
    () => ({
      restValue: expanded ? expandedContentHeight : collapsedContentHeight,
      lowerBound: collapsedContentHeight,
      upperBound: expandedContentHeight,
      onCommitDown: !embeddedInHeader && !expanded ? onToggleExpand : undefined,
      onCommitUp: !embeddedInHeader && expanded ? onToggleExpand : undefined,
      commitDistance: VERTICAL_COMMIT_DISTANCE,
      commitVelocity: VERTICAL_VELOCITY_COMMIT,
      rubberBandBelow: RUBBER_BAND_FACTOR,
      rubberBandAbove: RUBBER_BAND_FACTOR,
      springConfig: HEIGHT_SPRING,
    }),
    [
      collapsedContentHeight,
      embeddedInHeader,
      expanded,
      expandedContentHeight,
      onToggleExpand,
    ],
  );

  const handleVerticalPan = useSwipePanelGesture(
    animatedContentHeight,
    handleVerticalPanConfig,
  )
    .activeOffsetY([-6, 6])
    .failOffsetX([-18, 18]);

  const composedGesture = useMemo(() => {
    if (swipeEnabled && allowGridDragToExpand) {
      return Gesture.Race(horizontalPan, verticalPan);
    }
    if (swipeEnabled) {
      return horizontalPan;
    }
    if (allowGridDragToExpand) {
      return verticalPan;
    }
    return Gesture.Pan().enabled(false);
  }, [allowGridDragToExpand, horizontalPan, swipeEnabled, verticalPan]);

  return (
    <View style={styles.container}>
      {/* Content area — only this clips during expand/collapse */}
      <Animated.View style={[styles.contentArea, contentAreaAnimatedStyle]}>
        {showDayOfWeekHeader ? (
          <View style={styles.headerRow}>
            {dayLabels.map((label) => (
              <View key={label} style={styles.headerCell}>
                <Text style={styles.headerText}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Grid area */}
        <GestureDetector gesture={composedGesture}>
          {swipeEnabled ? (
            <View style={styles.gridViewport} onLayout={handleGridLayout}>
              <Animated.View
                style={[
                  styles.pagesStrip,
                  { width: pageWidth * pages.length },
                  stripAnimatedStyle,
                ]}
              >
                {pages.map((page) => (
                  <View
                    key={page.key}
                    style={[styles.page, { width: pageWidth }]}
                  >
                    <MonthPage
                      monthDate={page.monthDate}
                      gridDates={page.gridDates}
                      selectedDate={selectedDate}
                      highlightedDates={highlightedDates}
                      collapsedRowDates={collapsedRowDates}
                      today={today}
                      eventsByDay={page.eventsByDay}
                      theme={theme}
                      styles={styles}
                      showExpandedRows={showExpandedRows}
                      animatedContentHeight={animatedContentHeight}
                      collapsedContentHeight={collapsedContentHeight}
                      expandedContentHeight={expandedContentHeight}
                      onDayPress={onDayPress}
                      showSelectedDateHighlight={showSelectedDateHighlight}
                      weekStartDay={weekStartDay}
                    />
                  </View>
                ))}
              </Animated.View>
            </View>
          ) : (
            <View style={styles.gridViewport}>
              <MonthPage
                monthDate={pages[0].monthDate}
                gridDates={pages[0].gridDates}
                selectedDate={selectedDate}
                highlightedDates={highlightedDates}
                collapsedRowDates={collapsedRowDates}
                today={today}
                eventsByDay={pages[0].eventsByDay}
                theme={theme}
                styles={styles}
                showExpandedRows={showExpandedRows}
                animatedContentHeight={animatedContentHeight}
                collapsedContentHeight={collapsedContentHeight}
                expandedContentHeight={expandedContentHeight}
                onDayPress={onDayPress}
                showSelectedDateHighlight={showSelectedDateHighlight}
                weekStartDay={weekStartDay}
              />
            </View>
          )}
        </GestureDetector>
      </Animated.View>

      {showHandle ? (
        <GestureDetector gesture={handleVerticalPan}>
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
        </GestureDetector>
      ) : null}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens, embeddedInHeader: boolean) {
  const view = {
    container: {
      backgroundColor: theme.colors.background,
      paddingHorizontal: embeddedInHeader
        ? theme.spacing["3"]
        : theme.spacing["2"],
      paddingTop: theme.spacing["2"],
      paddingBottom: embeddedInHeader ? theme.spacing["1"] : undefined,
      zIndex: 10,
      ...(embeddedInHeader
        ? {}
        : {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.border,
          }),
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
    contentArea: {
      overflow: "hidden" as const,
    },
    gridViewport: {
      overflow: "hidden" as const,
    },
    pagesStrip: {
      flexDirection: "row" as const,
    },
    page: {},
    monthPageContent: {},

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
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    selectedText: {
      color: theme.colors.accentForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export const CompactMonthStrip = React.memo(CompactMonthStripComponent);

export type { CompactMonthStripProps };
