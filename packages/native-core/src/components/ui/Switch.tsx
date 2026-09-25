import { useMemo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../../providers/ThemeProvider";

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const KNOB_INSET = 3;
const KNOB_SIZE = TRACK_HEIGHT - KNOB_INSET * 2;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_SIZE - KNOB_INSET * 2;

/** Off mirrors shadcn (input track, contrasting knob); on is tonal primary. The hosting row owns the switch role. */
export function Switch({ value }: { value: boolean }) {
  const { theme, isDark } = useTheme();
  const colors = useMemo(
    () => ({
      trackOff: isDark ? theme.colors.input + "CC" : theme.colors.input,
      trackOn: theme.colors.primaryBase + "40",
      knobOff: isDark ? theme.colors.foreground : theme.colors.background,
      knobOn: theme.colors.primaryBase,
    }),
    [isDark, theme],
  );
  const knobShadow = useMemo(
    () => (theme.shadows.sm ? { boxShadow: [theme.shadows.sm] } : null),
    [theme.shadows.sm],
  );

  const progress = useDerivedValue(
    () => withTiming(value ? 1 : 0, { duration: 180 }),
    [value],
  );

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.trackOff, colors.trackOn],
    ),
  }));

  const knobStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.knobOff, colors.knobOn],
    ),
    transform: [{ translateX: progress.value * KNOB_TRAVEL }],
  }));

  return (
    <Animated.View
      style={[styles.track, trackStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.knob, knobShadow, knobStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: KNOB_INSET,
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
  },
});
