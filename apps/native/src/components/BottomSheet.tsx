import {
  AccessibilityInfo,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type KeyboardEvent as RNKeyboardEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import { LAYOUT_ICON, layoutSideSlot } from "../lib/app-layout";
import { splitSheetChildren } from "./sheet/sheet-children";

// ─── Constants ──────────────────────────────────────────────────────────────

const SHEET_RADIUS = 20;
const SHEET_TOP_GAP = 16;
const HANDLE_PILL_WIDTH = 48;
const HANDLE_PILL_HEIGHT = 6;
const RUBBER_BAND = 0.55;
const FOOTER_BASE_PADDING = 16;
const OVERLAY_LIGHT = 0.5;
const OVERLAY_DARK = 0.75;

const SPRING_OPEN = {
  damping: 32,
  stiffness: 280,
  mass: 0.9,
  overshootClamping: true,
} as const;
const SPRING_SETTLE = {
  damping: 30,
  stiffness: 260,
  mass: 0.85,
  overshootClamping: true,
} as const;
const CLOSE_DURATION = 220;
const OVERLAY_DURATION = 180;
const CLOSE_EASING = Easing.out(Easing.cubic);

type SheetSpring = {
  damping: number;
  stiffness: number;
  mass: number;
  overshootClamping: boolean;
};

const DISMISS_VELOCITY = 500;
const SNAP_VELOCITY_THRESHOLD = 250;

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

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) {
        setReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onCloseComplete?: () => void;
  children: ReactNode;
  /**
   * Snap points as fractions of screen height, sorted ascending.
   * The sheet will rest at these positions. Default: [0.92].
   * Use e.g. [0.45] for compact action menus, [0.5, 0.92] for expandable sheets.
   * Values are capped just below the status bar so the sheet never covers the screen.
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

type BottomSheetContextValue = {
  dismiss: () => void;
};

const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

function useBottomSheetContext() {
  const context = useContext(BottomSheetContext);
  if (!context) {
    throw new Error("BottomSheet components must be used within a BottomSheet");
  }
  return context;
}

// ─── Chrome ──────────────────────────────────────────────────────────────────

export function BottomSheetClose({
  onPress,
  accessibilityLabel = "Close",
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const { dismiss } = useBottomSheetContext();
  const styles = useMemo(() => createCloseStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress ?? dismiss}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      <Feather
        name="x"
        size={LAYOUT_ICON.close}
        color={theme.colors.foreground}
      />
    </Pressable>
  );
}

export function BottomSheetHeader({
  children,
  showClose = true,
  style,
}: {
  children: ReactNode;
  showClose?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createHeaderStyles(theme), [theme]);

  return (
    <View style={[styles.header, style]}>
      <View style={styles.titleSlot}>{children}</View>
      {showClose ? <BottomSheetClose /> : null}
    </View>
  );
}

BottomSheetHeader.displayName = "BottomSheetHeader";

export function BottomSheetTitle({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createTitleStyles(theme), [theme]);

  return (
    <Text style={[styles.title, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

export function BottomSheetBody({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createBodyStyles(theme), [theme]);

  return <View style={[styles.body, style]}>{children}</View>;
}

export function BottomSheetScrollView({
  children,
  style,
  contentContainerStyle,
  ...props
}: ComponentProps<typeof ScrollView>) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      {...props}
      style={[scrollViewStyles.scroll, style]}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  );
}

BottomSheetScrollView.displayName = "BottomSheetScrollView";

export function BottomSheetFooter({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createFooterStyles(theme), [theme]);
  const paddingBottom = Math.max(insets.bottom, FOOTER_BASE_PADDING);

  return (
    <View style={[styles.footer, style]}>
      <View style={{ paddingBottom }}>{children}</View>
    </View>
  );
}

BottomSheetFooter.displayName = "BottomSheetFooter";

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
    const { theme, isDark } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const reduceMotionSV = useSharedValue(false);
    const [mounted, setMounted] = useState(false);
    const keyboardVisibleRef = useRef(false);
    const closeSequenceRef = useRef(0);
    const closeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const isClosing = useSharedValue(false);
    const isDragging = useSharedValue(false);
    const overlayMaxOpacity = isDark ? OVERLAY_DARK : OVERLAY_LIGHT;

    const topGap = insets.top + SHEET_TOP_GAP;
    const maxSnapFraction =
      screenHeight > 0
        ? Math.min(0.96, (screenHeight - topGap) / screenHeight)
        : 0.92;

    // Sort snap points ascending and clamp just below the status bar
    const nextSortedSnaps = useMemo(
      () =>
        [...snapPointsProp]
          .map((p) => Math.min(p, maxSnapFraction))
          .sort((a, b) => a - b),
      [snapPointsProp, maxSnapFraction],
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
    const maxHeightSV = useSharedValue(maxHeight);
    const screenHeightSV = useSharedValue(screenHeight);
    const topGapSV = useSharedValue(topGap);

    useLayoutEffect(() => {
      maxHeightSV.value = maxHeight;
      screenHeightSV.value = screenHeight;
      topGapSV.value = topGap;
    }, [maxHeight, screenHeight, topGap, maxHeightSV, screenHeightSV, topGapSV]);

    const offsetsRef = useRef(offsets);
    offsetsRef.current = offsets;
    const maxHeightRef = useRef(maxHeight);
    maxHeightRef.current = maxHeight;
    const animatePositionRef = useRef<
      (toValue: number, spring: SheetSpring) => number
    >((toValue, spring) => withSpring(toValue, spring));
    const snapKey = sortedSnaps.join(",");
    const lastSnapKeyRef = useRef(snapKey);

    const animatePosition = useCallback(
      (toValue: number, spring: SheetSpring) => {
        if (reduceMotion) {
          return withTiming(toValue, {
            duration: CLOSE_DURATION,
            easing: CLOSE_EASING,
          });
        }
        return withSpring(toValue, spring);
      },
      [reduceMotion],
    );
    animatePositionRef.current = animatePosition;

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
    const finishUnmountIfCurrentRef = useRef(finishUnmountIfCurrent);
    finishUnmountIfCurrentRef.current = finishUnmountIfCurrent;
    const runFinishUnmountIfCurrent = useCallback((sequence: number) => {
      finishUnmountIfCurrentRef.current(sequence);
    }, []);

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
        translateY.value = animatePosition(offsets[clamped], SPRING_SETTLE);
      },
      [offsets, translateY, animatePosition],
    );

    useImperativeHandle(ref, () => ({ dismiss: requestClose, snapTo }), [
      requestClose,
      snapTo,
    ]);

    const contextValue = useMemo(
      (): BottomSheetContextValue => ({ dismiss: requestClose }),
      [requestClose],
    );

    // ── Keyboard tracking ───────────────────────────────────────────────
    // Lift the sheet onto the keyboard when there is room above it. Never
    // restart the snap animation — that fights the open spring and is the
    // main source of layout jumps.

    useEffect(() => {
      if (!visible) {
        keyboardOffset.value = 0;
        keyboardVisibleRef.current = false;
        return () => {};
      }

      const showEvent =
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent =
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

      const onShow = (e: RNKeyboardEvent) => {
        const kb = e.endCoordinates.height;
        const offset = Platform.OS === "ios" ? kb - insets.bottom : kb;
        keyboardVisibleRef.current = true;
        keyboardOffset.value = animatePositionRef.current(
          Math.max(0, offset),
          SPRING_SETTLE,
        );
      };

      const onHide = () => {
        keyboardVisibleRef.current = false;
        if (!isClosing.value) {
          keyboardOffset.value = animatePositionRef.current(0, SPRING_SETTLE);
        } else {
          keyboardOffset.value = 0;
        }
      };

      const s1 = Keyboard.addListener(showEvent, onShow);
      const s2 = Keyboard.addListener(hideEvent, onHide);
      return () => {
        s1.remove();
        s2.remove();
        keyboardVisibleRef.current = false;
        keyboardOffset.value = 0;
      };
    }, [visible, keyboardOffset, insets.bottom, isClosing]);

    // ── Open / close animations ─────────────────────────────────────────
    // Mount off-screen first, then spring in on the next frame. This effect
    // keys only on visible/mounted so inset or snap-point updates cannot
    // teleport the sheet back to hidden mid-gesture.

    useLayoutEffect(() => {
      if (visible && !mounted) {
        translateY.value = maxHeightRef.current;
        backdropOpacity.value = 0;
        keyboardOffset.value = 0;
        setMounted(true);
      }
    }, [visible, mounted, translateY, backdropOpacity, keyboardOffset]);

    useEffect(() => {
      if (!mounted) {
        return;
      }

      if (visible) {
        clearCloseFallbackTimer();
        closeSequenceRef.current += 1;
        isClosing.value = false;
        keyboardVisibleRef.current = false;
        keyboardOffset.value = 0;
        const mh = maxHeightRef.current;
        const offs = offsetsRef.current;
        cancelAnimation(translateY);
        cancelAnimation(backdropOpacity);
        translateY.value = mh;
        backdropOpacity.value = 0;
        const targetIdx =
          initialSnapIndex !== undefined
            ? Math.min(initialSnapIndex, offs.length - 1)
            : offs.length - 1;
        const frame = requestAnimationFrame(() => {
          translateY.value = animatePositionRef.current(
            offs[targetIdx],
            SPRING_OPEN,
          );
          backdropOpacity.value = withTiming(1, { duration: OVERLAY_DURATION });
        });
        return () => cancelAnimationFrame(frame);
      }

      const closeSequence = closeSequenceRef.current + 1;
      closeSequenceRef.current = closeSequence;
      isClosing.value = true;
      Keyboard.dismiss();
      keyboardOffset.value = 0;
      clearCloseFallbackTimer();
      cancelAnimation(translateY);
      cancelAnimation(backdropOpacity);
      const onCloseFinished = (finished?: boolean) => {
        "worklet";
        if (finished) {
          scheduleOnRN(runFinishUnmountIfCurrent, closeSequence);
        }
      };
      translateY.value = withTiming(
        maxHeightRef.current,
        { duration: CLOSE_DURATION, easing: CLOSE_EASING },
        onCloseFinished,
      );
      backdropOpacity.value = withTiming(0, { duration: CLOSE_DURATION });
      closeFallbackTimerRef.current = setTimeout(() => {
        runFinishUnmountIfCurrent(closeSequence);
      }, CLOSE_DURATION + 120);
      return clearCloseFallbackTimer;
    }, [
      visible,
      mounted,
      initialSnapIndex,
      translateY,
      backdropOpacity,
      keyboardOffset,
      isClosing,
      clearCloseFallbackTimer,
      runFinishUnmountIfCurrent,
    ]);

    useEffect(
      () => () => {
        clearCloseFallbackTimer();
      },
      [clearCloseFallbackTimer],
    );

    useEffect(() => {
      reduceMotionSV.value = reduceMotion;
    }, [reduceMotion, reduceMotionSV]);

    useEffect(() => {
      if (!visible) {
        return;
      }

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (keyboardVisibleRef.current) {
            Keyboard.dismiss();
            return true;
          }
          requestClose();
          return true;
        },
      );

      return () => subscription.remove();
    }, [visible, requestClose]);

    // Re-snap only when the snap-point list itself changes (e.g. bulk mail
    // more → move), never when window metrics jitter.
    useEffect(() => {
      if (!visible || !mounted) {
        lastSnapKeyRef.current = snapKey;
        return;
      }
      if (lastSnapKeyRef.current === snapKey) {
        return;
      }
      lastSnapKeyRef.current = snapKey;
      if (isClosing.value || isDragging.value) {
        return;
      }
      const nextOffsets = offsetsRef.current;
      translateY.value = animatePositionRef.current(
        nextOffsets[nextOffsets.length - 1],
        SPRING_SETTLE,
      );
    }, [snapKey, visible, mounted, translateY, isClosing, isDragging]);

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
              scheduleOnRN(requestClose);
            } else if (reduceMotionSV.value) {
              translateY.value = withTiming(target, {
                duration: CLOSE_DURATION,
              });
            } else {
              translateY.value = withSpring(target, SPRING_SETTLE);
            }
          })
          .onFinalize(() => {
            "worklet";
            isDragging.value = false;
          }),
      [
        offsets,
        maxHeight,
        translateY,
        isDragging,
        dragStartY,
        requestClose,
        reduceMotionSV,
      ],
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
              scheduleOnRN(requestClose);
            } else if (reduceMotionSV.value) {
              translateY.value = withTiming(target, {
                duration: CLOSE_DURATION,
              });
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
        reduceMotionSV,
      ],
    );

    // ── Animated styles ─────────────────────────────────────────────────

    const backdropStyle = useAnimatedStyle(() => {
      const height = Math.max(1, maxHeightSV.value);
      const progress = 1 - translateY.value / height;
      return {
        opacity:
          backdropOpacity.value * clamp(progress, 0, 1) * overlayMaxOpacity,
      };
    });

    const sheetStyle = useAnimatedStyle(() => {
      const maxLift = Math.max(
        0,
        screenHeightSV.value -
          maxHeightSV.value -
          topGapSV.value +
          translateY.value,
      );
      const lift = Math.min(keyboardOffset.value, maxLift);
      return {
        transform: [{ translateY: translateY.value - lift }],
      };
    });

    const contentWrapperAnimatedStyle = useAnimatedStyle(() => {
      const maxLift = Math.max(
        0,
        screenHeightSV.value -
          maxHeightSV.value -
          topGapSV.value +
          translateY.value,
      );
      const lift = Math.min(keyboardOffset.value, maxLift);
      return {
        paddingBottom: Math.max(0, keyboardOffset.value - lift),
      };
    });

    // Capture the last non-null children while the sheet is open so that
    // if the parent sets children to null during the close animation (e.g.
    // because a mutation succeeded and cleared the view state) we still
    // render the previous content until the sheet fully unmounts.
    const lastChildrenRef = useRef<ReactNode>(null);
    if (visible) {
      lastChildrenRef.current = children;
    }
    const renderedChildren = visible ? children : lastChildrenRef.current;
    const { body, footer, header } = useMemo(
      () => splitSheetChildren(renderedChildren),
      [renderedChildren],
    );
    const handleDivider = header == null;

    const handleOverlayPress = useCallback(() => {
      if (keyboardVisibleRef.current) {
        Keyboard.dismiss();
        return;
      }
      requestClose();
    }, [requestClose]);

    if (!mounted) return null;

    return (
      <BottomSheetContext.Provider value={contextValue}>
        <View style={styles.wrapper} pointerEvents="auto">
          <Animated.View style={[styles.overlay, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={handleOverlayPress}
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
            />
          </Animated.View>

          <Animated.View
            style={[styles.sheet, { height: maxHeight }, sheetStyle]}
          >
            <GestureDetector gesture={handleGesture}>
              <View
                style={[
                  styles.handleArea,
                  handleDivider ? styles.handleDivider : null,
                ]}
              >
                <View style={styles.handlePill} />
              </View>
            </GestureDetector>

            <Animated.View
              style={[styles.contentWrapper, contentWrapperAnimatedStyle]}
            >
              {header}
              <GestureDetector gesture={contentGesture}>
                <View style={styles.bodySlot}>{body}</View>
              </GestureDetector>
              {footer}
            </Animated.View>
          </Animated.View>
        </View>
      </BottomSheetContext.Provider>
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
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "#000",
    },

    sheet: {
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      ...(Platform.OS === "ios"
        ? {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
          }
        : { elevation: 24 }),
      overflow: "hidden",
    },

    handleArea: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 10,
      paddingBottom: 4,
    } as ViewStyle,

    handleDivider: {
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    } as ViewStyle,

    handlePill: {
      width: HANDLE_PILL_WIDTH,
      height: HANDLE_PILL_HEIGHT,
      borderRadius: 3,
      backgroundColor: theme.colors.mutedForeground + "99",
    } as ViewStyle,

    contentWrapper: {
      flex: 1,
      minHeight: 0,
    },

    bodySlot: {
      flex: 1,
      minHeight: 0,
    },
  });
}

function createHeaderStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      backgroundColor: theme.colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    } as ViewStyle,
    titleSlot: {
      flex: 1,
      minWidth: 0,
    } as ViewStyle,
  });
}

function createTitleStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    title: {
      fontSize: theme.typography.fontSize.xl.size,
      lineHeight: theme.typography.fontSize.xl.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } as TextStyle,
  });
}

function createBodyStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: theme.spacing["4"],
    } as ViewStyle,
  });
}

function createFooterStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["4"],
    } as ViewStyle,
  });
}

function createCloseStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    button: layoutSideSlot(theme),
    pressed: { opacity: 0.6 } as ViewStyle,
  });
}

const scrollViewStyles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
});
