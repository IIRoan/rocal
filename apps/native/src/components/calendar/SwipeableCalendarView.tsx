import React, { useCallback } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Distance (px) the finger must travel to commit to a navigation. */
const SWIPE_COMMIT_THRESHOLD = 60;

/** Velocity (px/s) that also commits to a navigation regardless of distance. */
const VELOCITY_COMMIT = 800;

/**
 * Rubber-band factor — how much the view resists past the commit point.
 * Lower = more resistance. iOS uses ~0.55 for scroll bounce.
 */
const RUBBER_BAND_FACTOR = 0.35;

/** Spring config that feels like iOS page transitions. */
const SNAP_SPRING = { damping: 26, stiffness: 300, mass: 0.8 };

/** Duration of the exit slide + fade (ms). */
const EXIT_DURATION = 180;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Rubber-band clamping — lets the view follow the finger but with increasing
 * resistance past the threshold, matching iOS overscroll physics.
 */
function rubberBand(offset: number, limit: number, factor: number): number {
  "worklet";
  if (Math.abs(offset) < limit) return offset;
  const sign = offset < 0 ? -1 : 1;
  const overshoot = Math.abs(offset) - limit;
  return sign * (limit + overshoot * factor);
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
  const opacity = useSharedValue(1);

  const handleSwipeLeft = useCallback(() => {
    onSwipeLeft();
  }, [onSwipeLeft]);

  const handleSwipeRight = useCallback(() => {
    onSwipeRight();
  }, [onSwipeRight]);

  const resetPosition = useCallback(() => {
    translateX.value = 0;
    opacity.value = 1;
  }, [translateX, opacity]);

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      "worklet";
      // Rubber-band the translation so it feels physical
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
        // Slide out to the left + fade
        translateX.value = withTiming(
          -screenWidth * 0.3,
          { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) {
              scheduleOnRN(handleSwipeLeft);
              scheduleOnRN(resetPosition);
            }
          },
        );
        opacity.value = withTiming(0, { duration: EXIT_DURATION });
      } else if (committedRight) {
        // Slide out to the right + fade
        translateX.value = withTiming(
          screenWidth * 0.3,
          { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) {
              scheduleOnRN(handleSwipeRight);
              scheduleOnRN(resetPosition);
            }
          },
        );
        opacity.value = withTiming(0, { duration: EXIT_DURATION });
      } else {
        // Snap back with spring
        translateX.value = withSpring(0, SNAP_SPRING);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    // Subtle scale-down as the view is dragged away (like iOS page curl)
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, screenWidth * 0.3],
      [1, 0.97],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX: translateX.value }, { scale }],
      opacity: opacity.value,
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
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
