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

/** Silky deceleration — no bounce, no snap. */
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

/**
 * Bottom "float swap" — compose gently sinks and fades; bulk bar floats up
 * into place with a soft scale settle.
 */
export function bottomChromeMotion(p: number, layer: "outgoing" | "incoming") {
  "worklet";
  if (layer === "outgoing") {
    return {
      opacity: interpolate(
        p,
        [0, 0.4, 0.75, 1],
        [1, 0.65, 0.12, 0],
        Extrapolation.CLAMP,
      ),
      translateY: interpolate(p, [0, 1], [0, 28], Extrapolation.CLAMP),
      scale: interpolate(p, [0, 1], [1, 0.82], Extrapolation.CLAMP),
    };
  }
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

/** List footer height — smooth linear blend. */
export function selectionFooterHeight(
  p: number,
  compose: number,
  bulk: number,
): number {
  "worklet";
  return interpolate(p, [0, 1], [compose, bulk], Extrapolation.CLAMP);
}
