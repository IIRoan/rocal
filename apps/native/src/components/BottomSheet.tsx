import { useCallback, useEffect, useMemo } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import type { KeyboardEvent as RNKeyboardEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Constants ───────────────────────────────────────────────────────────────

const SCREEN_HEIGHT = Dimensions.get("window").height;

/**
 * Maximum height as a fraction of the screen — matches the shadcn/vaul
 * `max-h-[80vh]` default but bumped to 92% for the event form which is tall.
 */
const MAX_SHEET_RATIO = 0.92;

/** How far (px) the user must drag down before we dismiss. */
const DISMISS_VELOCITY = 400;
const DISMISS_DISTANCE = 80;

/** Spring that feels like vaul's snap animation. */
const SPRING_CONFIG = { damping: 28, stiffness: 280, mass: 0.8 };

/** Overlay fade duration (ms). */
const OVERLAY_DURATION = 200;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BottomSheetProps {
  /** Whether the sheet is visible. */
  visible: boolean;
  /** Called when the sheet finishes closing. */
  onDismiss: () => void;
  /** Content rendered inside the sheet. Children manage their own scrolling. */
  children: React.ReactNode;
  /** Accessibility title for the sheet container. */
  title?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BottomSheet({
  visible,
  onDismiss,
  children,
  title,
}: BottomSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const maxHeight = SCREEN_HEIGHT * MAX_SHEET_RATIO;

  // Animated values
  const translateY = useSharedValue(maxHeight);
  const overlayOpacity = useSharedValue(0);
  const isOpen = useSharedValue(false);
  const keyboardHeight = useSharedValue(0);

  // ── Keyboard avoidance ───────────────────────────────────────────────────

  // ── Keyboard avoidance ───────────────────────────────────────────────────
  // Only listen while the sheet is visible so keyboard events from other
  // screens (e.g. search on the calendar tab) don't shift a hidden sheet.

  useEffect(() => {
    if (!visible) {
      // Reset immediately when the sheet is not visible
      keyboardHeight.value = 0;
      return;
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: RNKeyboardEvent) => {
      const kbHeight = e.endCoordinates.height;
      const offset = Platform.OS === "ios" ? kbHeight - insets.bottom : kbHeight;
      keyboardHeight.value = withSpring(Math.max(0, offset), SPRING_CONFIG);
    };

    const onHide = () => {
      keyboardHeight.value = withSpring(0, SPRING_CONFIG);
    };

    const sub1 = Keyboard.addListener(showEvent, onShow);
    const sub2 = Keyboard.addListener(hideEvent, onHide);

    return () => {
      sub1.remove();
      sub2.remove();
      keyboardHeight.value = 0;
    };
  }, [visible, keyboardHeight, insets.bottom]);

  // ── Open / close ─────────────────────────────────────────────────────────

  const open = useCallback(() => {
    isOpen.value = true;
    overlayOpacity.value = withTiming(1, { duration: OVERLAY_DURATION });
    translateY.value = withSpring(0, SPRING_CONFIG);
  }, [translateY, overlayOpacity, isOpen]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    keyboardHeight.value = 0;
    overlayOpacity.value = withTiming(0, { duration: 150 });
    translateY.value = withSpring(maxHeight, SPRING_CONFIG, (finished) => {
      if (finished) {
        isOpen.value = false;
        runOnJS(onDismiss)();
      }
    });
  }, [translateY, overlayOpacity, maxHeight, onDismiss, isOpen]);

  useEffect(() => {
    if (visible) {
      open();
    } else if (isOpen.value) {
      close();
    }
  }, [visible, open, close, isOpen]);

  // ── Handle pan gesture (drag the handle pill to dismiss) ─────────────────

  const handlePan = Gesture.Pan()
    .onUpdate((e) => {
      "worklet";
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      "worklet";
      if (
        e.translationY > DISMISS_DISTANCE ||
        e.velocityY > DISMISS_VELOCITY
      ) {
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // ── Overlay pan gesture (swipe down on the backdrop to dismiss) ──────────
  // This covers the entire screen area behind the sheet, so swiping down
  // anywhere outside the sheet content will dismiss it.

  const overlayPan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      "worklet";
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      "worklet";
      if (
        e.translationY > DISMISS_DISTANCE ||
        e.velocityY > DISMISS_VELOCITY
      ) {
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // ── Animated styles ──────────────────────────────────────────────────────

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    pointerEvents: isOpen.value ? ("auto" as const) : ("none" as const),
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value - keyboardHeight.value },
    ],
    maxHeight,
    paddingBottom: insets.bottom,
  }));

  const handleIndicatorOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, maxHeight * 0.3],
      [1, 0.3],
      Extrapolation.CLAMP,
    ),
  }));

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.wrapper} pointerEvents={visible ? "auto" : "none"}>
      {/* Overlay — tap or swipe down to dismiss */}
      <GestureDetector gesture={overlayPan}>
        <Animated.View style={[styles.overlay, overlayAnimatedStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
          />
        </Animated.View>
      </GestureDetector>

      {/* Sheet container */}
      <Animated.View
        style={[styles.sheet, sheetAnimatedStyle]}
        accessibilityRole="none"
        accessibilityLabel={title}
      >
        {/* Handle — drag down to dismiss */}
        <GestureDetector gesture={handlePan}>
          <View style={styles.handleArea}>
            <Animated.View
              style={[styles.handlePill, handleIndicatorOpacity]}
            />
          </View>
        </GestureDetector>

        {/* Content — children manage their own scrolling */}
        <View style={styles.contentWrapper}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    wrapper: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    },

    overlay: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
    },

    sheet: {
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      ...(Platform.OS === "ios"
        ? {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.12,
            shadowRadius: 8,
          }
        : { elevation: 16 }),
      overflow: "hidden" as const,
    },

    handleArea: {
      paddingTop: 16,
      paddingBottom: 8,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },

    handlePill: {
      width: 100,
      height: 8,
      borderRadius: 9999,
      backgroundColor: theme.colors.muted,
    },

    contentWrapper: {
      flex: 1,
    },
  } satisfies Record<string, ViewStyle>;

  return StyleSheet.create(view);
}
