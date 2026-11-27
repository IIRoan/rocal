import { useEffect } from "react";
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";
import { afterPaint } from "@workspace/calendar-core";

/** A 0–1 progress that rises once its content has painted and falls at once. */
export function useAfterPaintProgress(shown: boolean, enterMs: number, exitMs: number) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!shown) {
      progress.set(withTiming(0, { duration: exitMs }));
      return;
    }
    return afterPaint(() => {
      progress.set(withTiming(1, { duration: enterMs, easing: Easing.out(Easing.cubic) }));
    });
  }, [enterMs, exitMs, progress, shown]);
  return progress;
}
