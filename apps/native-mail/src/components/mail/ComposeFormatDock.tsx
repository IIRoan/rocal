import type { ReactNode } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useAfterPaintProgress } from "../../hooks/use-after-paint-progress";
import type { ComposeKeyboard } from "../../hooks/use-compose-keyboard";

const ENTER_MS = 200;
const EXIT_MS = 120;
const ENTER_OFFSET = 8;

/** Docks the format bar on top of the keyboard: it rides the keyboard, rises in after it has painted and leaves at once. */
export function ComposeFormatDock({
  visible,
  keyboard,
  bottomInset,
  children,
}: {
  visible: boolean;
  keyboard: ComposeKeyboard;
  /** The home-indicator inset it sits above while the keyboard is down. */
  bottomInset: number;
  children: ReactNode;
}) {
  const progress = useAfterPaintProgress(visible, ENTER_MS, EXIT_MS);
  const { height } = keyboard;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: -Math.max(height.get(), bottomInset) + (1 - progress.get()) * ENTER_OFFSET }],
  }));

  return (
    <Animated.View
      style={[styles.dock, animatedStyle]}
      pointerEvents={visible ? "box-none" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  } satisfies ViewStyle,
});
