import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withSpring,
  type SharedValue,
  type WithSpringConfig,
} from "react-native-reanimated";

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SPRING: WithSpringConfig = {
  damping: 26,
  stiffness: 300,
  mass: 0.8,
};
const DEFAULT_COMMIT_DISTANCE = 40;
const DEFAULT_COMMIT_VELOCITY = 400;
const DEFAULT_RUBBER_BAND = 0.3;

// ─── Config ──────────────────────────────────────────────────────────────────

export interface SwipePanelConfig {
  /**
   * The value the panel rests at when the gesture is not committed.
   * Should equal `lowerBound` (when resting collapsed/open) or `upperBound`
   * (when resting expanded/open).
   */
  restValue: number;
  /** Hard lower bound — rubber-banding or clamping applied below this. */
  lowerBound: number;
  /** Hard upper bound — rubber-banding or clamping applied above this. */
  upperBound: number;
  /** Drag distance (px) required to commit the gesture. @default 40 */
  commitDistance?: number;
  /** Velocity (px/s) that also triggers a commit. @default 400 */
  commitVelocity?: number;
  /**
   * Rubber-band elasticity when the value goes below `lowerBound`.
   * `0` = hard stop, `1` = no resistance. @default 0.3
   */
  rubberBandBelow?: number;
  /**
   * Rubber-band elasticity when the value goes above `upperBound`.
   * `0` = hard stop, `1` = no resistance. @default 0.3
   */
  rubberBandAbove?: number;
  /**
   * Called when the user commits a **downward** swipe (value heading toward
   * `upperBound`). When omitted, a downward commit snaps back to `restValue`.
   */
  onCommitDown?: () => void;
  /**
   * Called when the user commits an **upward** swipe (value heading toward
   * `lowerBound`). When omitted, an upward commit snaps back to `restValue`.
   */
  onCommitUp?: () => void;
  /** Spring config for commit / snap-back animations. */
  springConfig?: WithSpringConfig;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Returns a pre-configured `PanGesture` that drives `animatedValue` with:
 * - **Live tracking** — the value follows the finger in real time.
 * - **Rubber-banding** — resistance when dragging past either bound.
 * - **Threshold commit** — springs to the target bound and fires a callback
 *   when distance/velocity thresholds are crossed.
 * - **Snap-back** — springs back to `restValue` when the gesture is released
 *   before the threshold (i.e. the user pulled and returned their finger).
 *
 * The returned gesture is a plain RNGH `PanGesture`, so the caller can chain
 * additional modifiers (`.activeOffsetY`, `.failOffsetX`, …) directly:
 *
 * ```ts
 * const pan = useSwipePanelGesture(height, config)
 *   .activeOffsetY([-6, 6])
 *   .failOffsetX([-10, 10]);
 * ```
 *
 * **Usage — expand/collapse panel:**
 * ```ts
 * const pan = useSwipePanelGesture(panelHeight, {
 *   restValue:  expanded ? expandedHeight : collapsedHeight,
 *   lowerBound: collapsedHeight,
 *   upperBound: expandedHeight,
 *   onCommitDown: expanded ? undefined : onExpand,
 *   onCommitUp:   expanded ? onCollapse : undefined,
 * });
 * ```
 *
 * **Usage — dismissible bottom sheet:**
 * ```ts
 * const pan = useSwipePanelGesture(translateY, {
 *   restValue:     0,
 *   lowerBound:    0,
 *   upperBound:    maxHeight,
 *   rubberBandBelow: 0,   // hard stop — sheet can't open further
 *   rubberBandAbove: 0,   // don't resist dismissal
 *   onCommitDown:  onDismiss,
 * });
 * ```
 */
export function useSwipePanelGesture(
  animatedValue: SharedValue<number>,
  config: SwipePanelConfig,
) {
  const startValue = useSharedValue(0);

  const {
    restValue,
    lowerBound,
    upperBound,
    commitDistance = DEFAULT_COMMIT_DISTANCE,
    commitVelocity = DEFAULT_COMMIT_VELOCITY,
    rubberBandBelow = DEFAULT_RUBBER_BAND,
    rubberBandAbove = DEFAULT_RUBBER_BAND,
    onCommitDown,
    onCommitUp,
    springConfig = DEFAULT_SPRING,
  } = config;

  return Gesture.Pan()
    .onBegin(() => {
      "worklet";
      cancelAnimation(animatedValue);
      startValue.value = animatedValue.value;
    })
    .onUpdate((e) => {
      "worklet";
      const raw = startValue.value + e.translationY;
      let next: number;
      if (raw < lowerBound) {
        next =
          rubberBandBelow > 0
            ? lowerBound - (lowerBound - raw) * rubberBandBelow
            : lowerBound;
      } else if (raw > upperBound) {
        next =
          rubberBandAbove > 0
            ? upperBound + (raw - upperBound) * rubberBandAbove
            : upperBound;
      } else {
        next = raw;
      }
      animatedValue.value = next;
    })
    .onEnd((e) => {
      "worklet";
      const movedDown =
        e.translationY > commitDistance || e.velocityY > commitVelocity;
      const movedUp =
        e.translationY < -commitDistance || e.velocityY < -commitVelocity;

      if (movedDown && onCommitDown != null) {
        animatedValue.value = withSpring(upperBound, springConfig);
        runOnJS(onCommitDown)();
      } else if (movedUp && onCommitUp != null) {
        animatedValue.value = withSpring(lowerBound, springConfig);
        runOnJS(onCommitUp)();
      } else {
        animatedValue.value = withSpring(restValue, springConfig);
      }
    });
}
