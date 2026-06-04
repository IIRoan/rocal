import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type KeyboardEvent as RNKeyboardEvent,
  type ViewStyle,
} from "react-native";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Constants ──────────────────────────────────────────────────────────────

const SCRIM_COLOR = "rgba(0,0,0,0.42)";
const HANDLE_HEIGHT = 24; // paddingTop + pill + paddingBottom
const RUBBER_BAND = 0.55;

const SPRING_OPEN = {
  damping: 32,
  stiffness: 280,
  mass: 0.9,
  overshootClamping: false,
} as const;
const SPRING_SETTLE = {
  damping: 30,
  stiffness: 260,
  mass: 0.85,
  overshootClamping: false,
} as const;
const SPRING_CLOSE = {
  damping: 26,
  stiffness: 340,
  mass: 0.75,
  overshootClamping: true,
} as const;
const CLOSE_DURATION = 220;
const OVERLAY_DURATION = 180;

const DISMISS_VELOCITY = 500;
const SNAP_VELOCITY_THRESHOLD = 250;
const MAX_SNAP_FRACTION = 0.8; // cap sheet height at 80 % of screen

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute translateY offsets for each snap point. Sorted ascending (lowest = tallest sheet). */
function snapOffsets(
  points: number[],
  maxHeight: number,
  screenHeight: number,
): number[] {
  return points.map((p) => maxHeight - p * screenHeight).sort((a, b) => a - b);
}

/** Find the index of the nearest value in a sorted array. */
function nearestIndex(value: number, sorted: number[]): number {
  "worklet";
  let best = 0;
  let bestDist = Math.abs(value - sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const d = Math.abs(value - sorted[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Determine the target snap offset from current position + velocity. */
function resolveSnap(
  currentY: number,
  velocityY: number,
  offsets: number[],
  maxHeight: number,
): { target: number; dismiss: boolean } {
  "worklet";
  const lowestOffset = offsets[offsets.length - 1]; // shortest sheet
  const dismissThreshold = lowestOffset + 48;

  // Dismiss if pulled well below the lowest snap or flicked down fast
  if (currentY > dismissThreshold || velocityY > DISMISS_VELOCITY) {
    return { target: maxHeight, dismiss: true };
  }

  // Velocity-driven snap
  if (Math.abs(velocityY) > SNAP_VELOCITY_THRESHOLD) {
    const idx = nearestIndex(currentY, offsets);
    if (velocityY > 0) {
      if (idx === offsets.length - 1) {
        return { target: maxHeight, dismiss: true };
      }
      // Dragging down → shorter sheet (higher offset index)
      const next = Math.min(idx + 1, offsets.length - 1);
      return { target: offsets[next], dismiss: false };
    } else {
      // Dragging up → taller sheet (lower offset index)
      const next = Math.max(idx - 1, 0);
      return { target: offsets[next], dismiss: false };
    }
  }

  // Proximity snap
  const idx = nearestIndex(currentY, offsets);
  return { target: offsets[idx], dismiss: false };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onCloseComplete?: () => void;
  children: React.ReactNode;
  /**
   * Snap points as fractions of screen height, sorted ascending.
   * The sheet will rest at these positions. Default: [0.92].
   * Use e.g. [0.45] for compact action menus, [0.5, 0.92] for expandable sheets.
   * Values are capped at 0.80 (80 % of screen height) so the sheet never covers the full screen.
   */
  snapPoints?: number[];
  /** Which snap index to open at. Default: last (tallest). */
  initialSnapIndex?: number;
  /**
   * When true, a downward drag on the sheet content (in addition to the handle)
   * can collapse or dismiss the sheet. Set this to true only when the content's
   * scroll view is scrolled to the very top — pass false whenever the user has
   * scrolled down so that the scroll view retains full control of touches.
   * Prefer this shared value over the boolean prop so scroll position updates
   * without re-rendering on every scroll event.
   */
  swipeContentToDismissAtTop?: SharedValue<boolean>;
}

export interface BottomSheetHandle {
  dismiss: () => void;
  /** Snap to a specific snap index. */
  snapTo: (index: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(
  function BottomSheet(
    {
      visible,
      onDismiss,
      onCloseComplete,
      children,
      snapPoints: snapPointsProp = [0.92],
      initialSnapIndex,
      swipeContentToDismissAtTop,
    },
    ref,
  ) {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const [mounted, setMounted] = useState(false);
    const closeSequenceRef = useRef(0);
    const closeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const isClosing = useSharedValue(false);
    const isDragging = useSharedValue(false);

    // Sort snap points ascending and clamp to MAX_SNAP_FRACTION
    const nextSortedSnaps = useMemo(
      () =>
        [...snapPointsProp]
          .map((p) => Math.min(p, MAX_SNAP_FRACTION))
          .sort((a, b) => a - b),
      [snapPointsProp],
    );
    const lastOpenSortedSnapsRef = useRef<number[]>(nextSortedSnaps);
    if (visible) {
      lastOpenSortedSnapsRef.current = nextSortedSnaps;
    }
    const sortedSnaps = visible
      ? nextSortedSnaps
      : lastOpenSortedSnapsRef.current;
    const maxSnap = sortedSnaps[sortedSnaps.length - 1];
    const maxHeight = screenHeight * maxSnap;
    const offsets = useMemo(
      () => snapOffsets(sortedSnaps, maxHeight, screenHeight),
      [sortedSnaps, maxHeight, screenHeight],
    );

    // The translateY value: maxHeight = hidden, offsets[i] = at snap i, 0 = tallest sheet
    const translateY = useSharedValue(maxHeight);
    const backdropOpacity = useSharedValue(0);
    const keyboardOffset = useSharedValue(0);
    const dragStartY = useSharedValue(0);
    const preKeyboardSnapY = useSharedValue<number | null>(null);

    // ── Lifecycle ────────────────────────────────────────────────────────

    const clearCloseFallbackTimer = useCallback(() => {
      if (closeFallbackTimerRef.current !== null) {
        clearTimeout(closeFallbackTimerRef.current);
        closeFallbackTimerRef.current = null;
      }
    }, []);

    const finishUnmount = useCallback(() => {
      clearCloseFallbackTimer();
      isClosing.value = false;
      setMounted(false);
      onCloseComplete?.();
    }, [clearCloseFallbackTimer, onCloseComplete, isClosing]);

    const finishUnmountIfCurrent = useCallback(
      (sequence: number) => {
        if (sequence !== closeSequenceRef.current || visible) {
          return;
        }
        finishUnmount();
      },
      [finishUnmount, visible],
    );

    const requestClose = useCallback(() => {
      if (isClosing.value) return;
      isClosing.value = true;
      Keyboard.dismiss();
      keyboardOffset.value = 0;
      onDismiss();
    }, [onDismiss, isClosing, keyboardOffset]);

    const snapTo = useCallback(
      (index: number) => {
        const clamped = Math.max(0, Math.min(index, offsets.length - 1));
        translateY.value = withSpring(offsets[clamped], SPRING_SETTLE);
      },
      [offsets, translateY],
    );

    useImperativeHandle(ref, () => ({ dismiss: requestClose, snapTo }), [
      requestClose,
      snapTo,
    ]);

    // ── Keyboard tracking ───────────────────────────────────────────────

    useEffect(() => {
      if (!visible) {
        keyboardOffset.value = 0;
        return;
      }

      const showEvent =
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent =
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

      const onShow = (e: RNKeyboardEvent) => {
        const kb = e.endCoordinates.height;
        const offset = Platform.OS === "ios" ? kb - insets.bottom : kb;
        if (preKeyboardSnapY.value === null) {
          preKeyboardSnapY.value = translateY.value;
        }
        translateY.value = withSpring(offsets[0], SPRING_SETTLE);
        keyboardOffset.value = withSpring(Math.max(0, offset), SPRING_SETTLE);
      };

      const onHide = () => {
        if (preKeyboardSnapY.value !== null && !isClosing.value) {
          translateY.value = withSpring(preKeyboardSnapY.value, SPRING_SETTLE);
        }
        preKeyboardSnapY.value = null;
        keyboardOffset.value = withSpring(0, SPRING_SETTLE);
      };

      const s1 = Keyboard.addListener(showEvent, onShow);
      const s2 = Keyboard.addListener(hideEvent, onHide);
      return () => {
        s1.remove();
        s2.remove();
        preKeyboardSnapY.value = null;
        keyboardOffset.value = 0;
      };
    }, [
      visible,
      keyboardOffset,
      insets.bottom,
      isClosing,
      offsets,
      preKeyboardSnapY,
      translateY,
    ]);

    // ── Open / close animations ─────────────────────────────────────────

    useEffect(() => {
      if (visible) setMounted(true);
    }, [visible]);

    useEffect(() => {
      if (visible) {
        clearCloseFallbackTimer();
        closeSequenceRef.current += 1;
        isClosing.value = false;
        preKeyboardSnapY.value = null;
        cancelAnimation(translateY);
        cancelAnimation(backdropOpacity);
        translateY.value = maxHeight;
        backdropOpacity.value = 0;
        const targetIdx =
          initialSnapIndex !== undefined
            ? Math.min(initialSnapIndex, offsets.length - 1)
            : offsets.length - 1;
        translateY.value = withSpring(offsets[targetIdx], SPRING_OPEN);
        backdropOpacity.value = withTiming(1, { duration: OVERLAY_DURATION });
      } else {
        const closeSequence = closeSequenceRef.current + 1;
        closeSequenceRef.current = closeSequence;
        isClosing.value = true;
        Keyboard.dismiss();
        preKeyboardSnapY.value = null;
        keyboardOffset.value = 0;
        clearCloseFallbackTimer();
        cancelAnimation(translateY);
        cancelAnimation(backdropOpacity);
        translateY.value = withSpring(maxHeight, SPRING_CLOSE, (finished) => {
          if (finished) {
            runOnJS(finishUnmountIfCurrent)(closeSequence);
          }
        });
        backdropOpacity.value = withTiming(0, { duration: CLOSE_DURATION });
        closeFallbackTimerRef.current = setTimeout(() => {
          finishUnmountIfCurrent(closeSequence);
        }, CLOSE_DURATION + 120);
      }
    }, [
      visible,
      maxHeight,
      offsets,
      initialSnapIndex,
      translateY,
      backdropOpacity,
      keyboardOffset,
      isClosing,
      clearCloseFallbackTimer,
      finishUnmountIfCurrent,
      preKeyboardSnapY,
    ]);

    useEffect(
      () => () => {
        clearCloseFallbackTimer();
      },
      [clearCloseFallbackTimer],
    );

    // Re-snap when offsets change while open (e.g. snapPoints change)
    useEffect(() => {
      if (mounted && !isClosing.value && translateY.value < maxHeight) {
        translateY.value = withSpring(
          offsets[offsets.length - 1],
          SPRING_SETTLE,
        );
      }
    }, [offsets, maxHeight, mounted, translateY]);

    // ── Handle drag gesture ─────────────────────────────────────────────

    const handleGesture = useMemo(
      () =>
        Gesture.Pan()
          .activeOffsetY(6)
          .failOffsetX([-20, 20])
          .onStart(() => {
            "worklet";
            isDragging.value = true;
            dragStartY.value = translateY.value;
            cancelAnimation(translateY);
          })
          .onUpdate((e) => {
            "worklet";
            const raw = dragStartY.value + e.translationY;
            const topBound = offsets[0]; // tallest sheet offset (closest to 0)
            const bottomBound = offsets[offsets.length - 1]; // shortest sheet offset

            if (raw < topBound) {
              // Rubber-band above tallest snap
              const over = topBound - raw;
              translateY.value = topBound - over * RUBBER_BAND;
            } else if (raw > bottomBound) {
              // Rubber-band below shortest snap (toward dismiss)
              const over = raw - bottomBound;
              translateY.value = bottomBound + over * RUBBER_BAND;
            } else {
              translateY.value = raw;
            }
          })
          .onEnd((e) => {
            "worklet";
            isDragging.value = false;
            const { target, dismiss } = resolveSnap(
              translateY.value,
              e.velocityY,
              offsets,
              maxHeight,
            );
            if (dismiss) {
              runOnJS(requestClose)();
            } else {
              translateY.value = withSpring(target, SPRING_SETTLE);
            }
          })
          .onFinalize(() => {
            "worklet";
            isDragging.value = false;
          }),
      [offsets, maxHeight, translateY, isDragging, dragStartY, requestClose],
    );

    // ── Content swipe-to-dismiss gesture ────────────────────────────────
    // Enabled only when swipeContentToDismiss=true (caller reports scroll is at top).
    // failOffsetY([-5, 99999]): fails immediately on any upward drag so inner
    // ScrollViews retain full control of scroll-up events. Only downward drag
    // past activeOffsetY(10) activates the sheet dismiss.

    const contentGesture = useMemo(
      () =>
        Gesture.Pan()
          .manualActivation(true)
          .activeOffsetY(10)
          .failOffsetX([-20, 20])
          .failOffsetY([-5, 99999])
          .onTouchesDown((_, state) => {
            "worklet";
            if (swipeContentToDismissAtTop?.value) {
              state.activate();
            } else {
              state.fail();
            }
          })
          .onStart(() => {
            "worklet";
            dragStartY.value = translateY.value;
            cancelAnimation(translateY);
          })
          .onUpdate((e) => {
            "worklet";
            if (e.translationY > 0) {
              const raw = dragStartY.value + e.translationY;
              const bottomBound = offsets[offsets.length - 1];
              if (raw > bottomBound) {
                const over = raw - bottomBound;
                translateY.value = bottomBound + over * RUBBER_BAND;
              } else {
                translateY.value = raw;
              }
            }
          })
          .onEnd((e) => {
            "worklet";
            const { target, dismiss } = resolveSnap(
              translateY.value,
              e.velocityY,
              offsets,
              maxHeight,
            );
            if (dismiss) {
              runOnJS(requestClose)();
            } else {
              translateY.value = withSpring(target, SPRING_SETTLE);
            }
          }),
      [
        offsets,
        maxHeight,
        translateY,
        dragStartY,
        requestClose,
        swipeContentToDismissAtTop,
      ],
    );

    // ── Animated styles ─────────────────────────────────────────────────

    const backdropStyle = useAnimatedStyle(() => {
      // Fade backdrop in proportion to how far the sheet is pulled down
      const progress = 1 - translateY.value / maxHeight;
      return {
        opacity: backdropOpacity.value * clamp(progress, 0, 1),
      };
    });

    const sheetStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    const contentWrapperAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: -keyboardOffset.value }],
    }));

    // Capture the last non-null children while the sheet is open so that
    // if the parent sets children to null during the close animation (e.g.
    // because a mutation succeeded and cleared the view state) we still
    // render the previous content until the sheet fully unmounts.
    const lastChildrenRef = useRef<React.ReactNode>(null);
    if (visible) {
      lastChildrenRef.current = children;
    }
    const renderedChildren = visible ? children : lastChildrenRef.current;

    if (!mounted) return null;

    return (
      <View style={styles.wrapper} pointerEvents="auto">
        <Animated.View style={[styles.overlay, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
          />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { height: maxHeight }, sheetStyle]}
        >
          <GestureDetector gesture={handleGesture}>
            <View style={styles.handleArea}>
              <View style={styles.handlePill} />
            </View>
          </GestureDetector>

          <GestureDetector gesture={contentGesture}>
            <Animated.View
              style={[styles.contentWrapper, contentWrapperAnimatedStyle]}
            >
              {renderedChildren}
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </View>
    );
  },
);

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrapper: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    } as ViewStyle,

    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: SCRIM_COLOR,
    } as ViewStyle,

    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      ...(Platform.OS === "ios"
        ? {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
          }
        : { elevation: 24 }),
      overflow: "hidden",
    } as ViewStyle,

    handleArea: {
      height: HANDLE_HEIGHT,
      paddingTop: 10,
      paddingBottom: 10,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,

    handlePill: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.colors.muted,
    } as ViewStyle,

    contentWrapper: {
      flex: 1,
      minHeight: 0,
    } as ViewStyle,
  });
}
