import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useBottomSheetInternal } from "@gorhom/bottom-sheet";
import { getBottomSheetViewportHeight } from "../../lib/bottom-sheet-layout";

const KEYBOARD_SHOWN = 1;

export function SheetViewport({ children }: { children: ReactNode }) {
  const {
    animatedLayoutState,
    animatedPosition,
    animatedSheetHeight,
    animatedKeyboardState,
  } = useBottomSheetInternal();
  const viewportStyle = useAnimatedStyle(() => {
    const layout = animatedLayoutState.get();
    const keyboard = animatedKeyboardState.get();
    return {
      height: getBottomSheetViewportHeight(
        layout.containerHeight,
        animatedPosition.get(),
        animatedSheetHeight.get(),
        layout.handleHeight,
        keyboard.status === KEYBOARD_SHOWN ? keyboard.heightWithinContainer : 0,
      ),
    };
  });

  return (
    <Animated.View style={[styles.viewport, viewportStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: { flexShrink: 0, minHeight: 0, overflow: "hidden" },
});
