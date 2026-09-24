import {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  withTiming,
} from "react-native-reanimated";

/** Shared duration for selection chrome + list footer. */
export const MAIL_SELECT_CHROME_MS = 420;

const MAIL_SELECT_EASING = Easing.bezier(0.22, 1, 0.36, 1);

const MAIL_SELECT_EXIT_EASING = Easing.bezier(0.4, 0, 0.2, 1);

export function runSelectionTransition(
  progress: SharedValue<number>,
  active: boolean,
) {
  cancelAnimation(progress);
  progress.value = withTiming(active ? 1 : 0, {
    duration: active ? MAIL_SELECT_CHROME_MS : 360,
    easing: active ? MAIL_SELECT_EASING : MAIL_SELECT_EXIT_EASING,
  });
}

/** Checkbox toggle — soft spring, separate from chrome. */
export const MAIL_SELECT_CHECK_SPRING = {
  damping: 32,
  stiffness: 280,
  mass: 0.7,
  overshootClamping: true,
} as const;

export function bottomChromeMotion(p: number) {
  "worklet";
  return {
    opacity: interpolate(
      p,
      [0, 0.25, 0.6, 1],
      [0, 0, 0.7, 1],
      Extrapolation.CLAMP,
    ),
    translateY: interpolate(p, [0, 1], [44, 0], Extrapolation.CLAMP),
    scale: interpolate(p, [0, 1], [0.965, 1], Extrapolation.CLAMP),
  };
}

export function selectionFooterHeight(
  p: number,
  compose: number,
  bulk: number,
): number {
  "worklet";
  return interpolate(p, [0, 1], [compose, bulk], Extrapolation.CLAMP);
}
