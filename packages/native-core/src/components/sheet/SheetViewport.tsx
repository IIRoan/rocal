import { useEffect, type ReactNode } from "react";
import { Keyboard, Platform, StyleSheet } from "react-native";
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
  const keyboardTop = useSharedValue(
    Keyboard.metrics()?.screenY ?? Number.POSITIVE_INFINITY,
  );
  const isAndroid = Platform.OS === "android";
  useEffect(() => {
    if (!isAndroid) return;
    const subscription = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardTop.set(event.endCoordinates.screenY);
    });
    return () => subscription.remove();
  }, [isAndroid, keyboardTop]);
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
    // Android resize mode reports zero overlap even when edge-to-edge leaves the container behind the keyboard.
    const keyboardOverlap = isAndroid
      ? Math.max(
          0,
          layout.containerOffset.top +
            layout.containerHeight -
            keyboardTop.get(),
        )
      : keyboard.heightWithinContainer;
    return {
      height: getBottomSheetViewportHeight(
        layout.containerHeight,
        restingPosition.get(),
        animatedSheetHeight.get(),
        layout.handleHeight,
        keyboard.status === KEYBOARD_SHOWN ? keyboardOverlap : 0,
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
