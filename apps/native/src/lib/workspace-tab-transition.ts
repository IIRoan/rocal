import { Platform } from "react-native";
import {
  Easing,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** Same duration as native stack pushes in `navigation-routes`. */
export const WORKSPACE_TAB_TRANSITION_MS = 280;

/**
 * React Navigation's iOS stack spring (`TransitionIOSSpec`).
 * Overshoot is clamped so the page does not bounce.
 */
const IOS_STACK_SPRING = {
  damping: 500,
  stiffness: 1000,
  mass: 3,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
} as const;

/** Material standard easing for Android activity transitions. */
const ANDROID_EASING = Easing.bezier(0.4, 0, 0.2, 1);

/** Outgoing screen recedes this fraction of the width (UINavigationController). */
export const STACK_BACK_PEEK = 0.3;

/** Dim on the covered screen during an iOS push. */
export const STACK_COVER_OVERLAY = 0.07;

export function tabProgressTarget(tab: "calendar" | "mail"): number {
  return tab === "mail" ? 1 : 0;
}

export function animateTabProgress(
  progress: SharedValue<number>,
  target: number,
  reduceMotion: boolean,
) {
  if (reduceMotion) {
    progress.value = target;
    return;
  }

  if (Platform.OS === "ios") {
    progress.value = withSpring(target, IOS_STACK_SPRING);
    return;
  }

  progress.value = withTiming(target, {
    duration: WORKSPACE_TAB_TRANSITION_MS,
    easing: ANDROID_EASING,
  });
}
