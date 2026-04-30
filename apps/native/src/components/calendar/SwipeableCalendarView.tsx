import React, { useCallback } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Directions, Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// ─── Props ───────────────────────────────────────────────────────────────────

interface SwipeableCalendarViewProps {
  /** The calendar view content to render */
  children: React.ReactNode;
  /** Callback when user swipes left (navigate forward) */
  onSwipeLeft: () => void;
  /** Callback when user swipes right (navigate backward) */
  onSwipeRight: () => void;
  /** Whether swipe gestures are enabled (default: true) */
  enabled?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SwipeableCalendarView({
  children,
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
}: SwipeableCalendarViewProps) {
  const { width: screenWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);

  const handleSwipeLeft = useCallback(() => {
    onSwipeLeft();
  }, [onSwipeLeft]);

  const handleSwipeRight = useCallback(() => {
    onSwipeRight();
  }, [onSwipeRight]);

  const resetPosition = useCallback(() => {
    translateX.value = 0;
  }, [translateX]);

  const animateAndNavigate = useCallback(
    (targetX: number, callback: () => void) => {
      "worklet";
      translateX.value = withTiming(
        targetX,
        { duration: 200, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) {
            runOnJS(callback)();
            runOnJS(resetPosition)();
          }
        },
      );
    },
    [translateX, resetPosition],
  );

  const leftFling = Gesture.Fling()
    .direction(Directions.LEFT)
    .enabled(enabled)
    .onEnd(() => {
      animateAndNavigate(-screenWidth, handleSwipeLeft);
    });

  const rightFling = Gesture.Fling()
    .direction(Directions.RIGHT)
    .enabled(enabled)
    .onEnd(() => {
      animateAndNavigate(screenWidth, handleSwipeRight);
    });

  const composedGesture = Gesture.Race(leftFling, rightFling);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
});

export type { SwipeableCalendarViewProps };
