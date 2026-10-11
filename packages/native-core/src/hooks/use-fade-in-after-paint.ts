import { useEffect } from "react";
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { afterPaint } from "@workspace/calendar-core";

/** Replaces Reanimated `entering` presets, which start in the render frame. */
export function useFadeInAfterPaint(duration: number, visible = true) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    if (!visible) {
      opacity.value = 0;
      return;
    }
    return afterPaint(() => {
      opacity.value = withTiming(1, { duration });
    });
  }, [duration, opacity, reduceMotion, visible]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
