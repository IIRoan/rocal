import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useBottomSheetInternal } from "@gorhom/bottom-sheet";
import {
  getBottomSheetViewportHeight,
  getSheetRestingPosition,
} from "../../lib/bottom-sheet-layout";

const KEYBOARD_SHOWN = 1;
const ANIMATION_RUNNING = 1;
const GESTURE_ACTIVE = 4;

export function SheetViewport({ children }: { children: ReactNode }) {
  const {
    animatedLayoutState,
    animatedPosition,
    animatedSheetHeight,
    animatedKeyboardState,
    animatedAnimationState,
    animatedContentGestureState,
    animatedHandleGestureState,
  } = useBottomSheetInternal();
  const restingPosition = useSharedValue(0);

  useAnimatedReaction(
    () => {
      const animation = animatedAnimationState.get();
      const target =
        animation.status === ANIMATION_RUNNING &&
        animation.nextPosition !== undefined
          ? animation.nextPosition
          : null;
      return getSheetRestingPosition(
        animatedPosition.get(),
        target,
        animatedContentGestureState.get() === GESTURE_ACTIVE ||
          animatedHandleGestureState.get() === GESTURE_ACTIVE,
      );
    },
    (next) => {
      if (next !== null) restingPosition.set(next);
    },
  );

  const viewportStyle = useAnimatedStyle(() => {
    const layout = animatedLayoutState.get();
    const keyboard = animatedKeyboardState.get();
    return {
      height: getBottomSheetViewportHeight(
        layout.containerHeight,
        restingPosition.get(),
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
