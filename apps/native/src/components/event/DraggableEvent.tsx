import { useCallback, useMemo } from "react";
import { StyleSheet, Text, type TextStyle, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../providers/ThemeProvider";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { HOUR_HEIGHT } from "../calendar/timeline-utils";
import { resolveEventBlockColor } from "../calendar/timeline-utils";
import { formatTimeRange } from "./event-card-utils";
import {
  LONG_PRESS_DURATION_MS,
  SNAP_INTERVAL_MINUTES,
  DRAG_SCALE,
  DRAG_OPACITY,
  SPRING_CONFIG,
  yOffsetToTime,
  xOffsetToColumnIndex,
  computeRescheduledTimes,
  findEventColumnIndex,
  type DropTarget,
  type DragResult,
} from "./draggable-event-utils";

// Re-export types for consumers
export type { DropTarget, DragResult } from "./draggable-event-utils";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DraggableEventProps {
  /** The event to make draggable */
  event: DecoratedCalendarEvent;
  /** Pre-calculated top position in the timeline */
  top: number;
  /** Pre-calculated height in the timeline */
  height: number;
  /** Time format: "12h" or "24h" */
  timeFormat?: "12h" | "24h";
  /** Array of dates representing the visible day columns (left to right) */
  columnDates: Date[];
  /** Width of each day column in pixels */
  columnWidth: number;
  /** Callback when the event is tapped (not dragged) */
  onPress?: (event: DecoratedCalendarEvent) => void;
  /** Callback when the event is dropped at a new position */
  onDrop?: (result: DragResult) => void;
  /** Whether drag is enabled (default: true) */
  dragEnabled?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DraggableEvent({
  event,
  top,
  height,
  timeFormat = "12h",
  columnDates,
  columnWidth,
  onPress,
  onDrop,
  dragEnabled = true,
}: DraggableEventProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const colors = resolveEventBlockColor(event.color, theme);
  const timeLabel = formatTimeRange(event, timeFormat);

  // ── Shared values for gesture animation ──────────────────────────────────

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const zIndex = useSharedValue(1);

  // Track the starting position for the gesture so we can compute absolute
  // position within the columns container.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // ── Haptic feedback callbacks (must run on JS thread) ────────────────────

  const triggerDragStartHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const triggerHoverHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const triggerDropHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  // ── Drop handler (runs on JS thread) ─────────────────────────────────────

  const handleDrop = useCallback(
    (finalTranslateX: number, finalTranslateY: number) => {
      if (!onDrop) return;

      // Compute the absolute Y position within the grid
      const absoluteY = top + finalTranslateY;
      const { hour, minute } = yOffsetToTime(absoluteY, HOUR_HEIGHT);

      // Determine which column the event was dropped in.
      const eventStartDate = new Date(event.start);
      const effectiveOriginalCol = findEventColumnIndex(eventStartDate, columnDates);
      const absoluteX = effectiveOriginalCol * columnWidth + finalTranslateX;
      const colIdx = xOffsetToColumnIndex(absoluteX, columnWidth, columnDates.length);

      const targetDate = columnDates[colIdx];
      if (!targetDate) return;

      const dropTarget: DropTarget = { date: targetDate, hour, minute };
      const { newStart, newEnd } = computeRescheduledTimes(event, dropTarget);

      // Only fire if the time actually changed
      const originalStart = new Date(event.start);
      if (
        newStart.getTime() !== originalStart.getTime()
      ) {
        onDrop({ event, newStart, newEnd });
      }
    },
    [event, top, columnDates, columnWidth, onDrop],
  );

  // Track the last snapped position to trigger hover haptic only on change
  const lastSnappedHour = useSharedValue(-1);
  const lastSnappedCol = useSharedValue(-1);

  // ── Gesture definition ───────────────────────────────────────────────────

  const longPressGesture = Gesture.LongPress()
    .minDuration(LONG_PRESS_DURATION_MS)
    .enabled(dragEnabled)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(DRAG_SCALE, SPRING_CONFIG);
      opacity.value = withTiming(DRAG_OPACITY, { duration: 150 });
      zIndex.value = 100;
      startX.value = translateX.value;
      startY.value = translateY.value;
      lastSnappedHour.value = -1;
      lastSnappedCol.value = -1;
      runOnJS(triggerDragStartHaptic)();
    });

  const panGesture = Gesture.Pan()
    .enabled(dragEnabled)
    .manualActivation(true)
    .onTouchesMove((_event, stateManager) => {
      // Only allow pan if long press has activated drag mode
      if (isDragging.value) {
        stateManager.activate();
      } else {
        stateManager.fail();
      }
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;

      // Check if we've moved to a new snap position for hover haptic
      const absoluteY = top + translateY.value;
      const totalMinutes = Math.max(0, Math.min((absoluteY / HOUR_HEIGHT) * 60, 24 * 60 - 1));
      const snappedMinutes = Math.round(totalMinutes / SNAP_INTERVAL_MINUTES) * SNAP_INTERVAL_MINUTES;
      const currentHour = Math.floor(snappedMinutes / 60);

      const eventStartDate = new Date(event.start);
      const effectiveOriginalCol = findEventColumnIndex(eventStartDate, columnDates);
      const absoluteX = effectiveOriginalCol * columnWidth + translateX.value;
      const currentCol = Math.max(
        0,
        Math.min(Math.floor(absoluteX / columnWidth), columnDates.length - 1),
      );

      if (
        currentHour !== lastSnappedHour.value ||
        currentCol !== lastSnappedCol.value
      ) {
        lastSnappedHour.value = currentHour;
        lastSnappedCol.value = currentCol;
        runOnJS(triggerHoverHaptic)();
      }
    })
    .onEnd(() => {
      // Capture final values before resetting
      const finalX = translateX.value;
      const finalY = translateY.value;

      runOnJS(triggerDropHaptic)();
      runOnJS(handleDrop)(finalX, finalY);

      // Animate back to original position
      translateX.value = withSpring(0, SPRING_CONFIG);
      translateY.value = withSpring(0, SPRING_CONFIG);
      scale.value = withSpring(1, SPRING_CONFIG);
      opacity.value = withTiming(1, { duration: 150 });
      isDragging.value = false;
      zIndex.value = 1;
    })
    .onFinalize(() => {
      // Safety reset if gesture is cancelled
      if (isDragging.value) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        scale.value = withSpring(1, SPRING_CONFIG);
        opacity.value = withTiming(1, { duration: 150 });
        isDragging.value = false;
        zIndex.value = 1;
      }
    });

  // Tap gesture for regular press (when not dragging)
  const tapGesture = Gesture.Tap()
    .enabled(!!onPress)
    .onEnd(() => {
      if (!isDragging.value && onPress) {
        runOnJS(onPress)(event);
      }
    });

  // Compose gestures: long press activates drag mode, then pan moves the event.
  // Tap is exclusive — it fires only if long press doesn't activate.
  const composedGesture = Gesture.Race(
    tapGesture,
    Gesture.Simultaneous(longPressGesture, panGesture),
  );

  // ── Animated styles ──────────────────────────────────────────────────────

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
    zIndex: zIndex.value,
  }));

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.eventBlock,
          {
            top,
            height,
            backgroundColor: colors.bg,
          },
          animatedStyle,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${timeLabel}. Long press to drag and reschedule.`}
        accessibilityHint="Long press and drag to move this event to a different time"
      >
        <Text
          style={[styles.eventTitle, { color: colors.fg }]}
          numberOfLines={1}
        >
          {event.title}
        </Text>
        {height >= HOUR_HEIGHT / 2 && (
          <Text
            style={[styles.eventTime, { color: colors.fg }]}
            numberOfLines={1}
          >
            {timeLabel}
          </Text>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    eventBlock: {
      position: "absolute" as const,
      left: 1,
      right: 1,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: 2,
      paddingVertical: 1,
      overflow: "hidden" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
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

export type { DraggableEventProps as DraggableEventPropsType };
