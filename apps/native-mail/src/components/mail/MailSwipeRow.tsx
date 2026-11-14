import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { memoizeStyles } from "../../lib/memoize-styles";
import type { MailSwipeSpec } from "../../lib/mail/mail-swipe-actions";

const ACTION_THRESHOLD = 88;
const MAX_SWIPE = 140;
const DISMISS_X = 600;
const SPRING = { damping: 26, stiffness: 260, mass: 0.8 };

interface MailSwipeRowProps {
  children: React.ReactNode;
  enabled: boolean;
  /** Runs on a swipe right; a dismissing spec keeps the row offscreen until its promise settles. */
  right?: MailSwipeSpec;
  left?: MailSwipeSpec;
  accessibilityActions: MailSwipeSpec[];
}

/** Swipe right or left past the threshold to run that side's configured action. */
export function MailSwipeRow({
  children,
  enabled,
  right,
  left,
  accessibilityActions,
}: MailSwipeRowProps) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const translateX = useSharedValue(0);
  const armed = useSharedValue(false);
  const canSwipeRight = Boolean(right);
  const canSwipeLeft = Boolean(left);

  const pulse = () => {
    // Haptics are unavailable on some devices; a dropped pulse is harmless.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
      () => undefined,
    );
  };

  const reset = () => {
    translateX.set(withSpring(0, SPRING));
  };

  // Each action toasts its own failures; the row only needs it started.
  const runRight = () => {
    void Promise.resolve(right?.run()).then(reset, reset);
  };
  const runLeft = () => {
    void Promise.resolve(left?.run()).then(reset, reset);
  };

  const rightDismisses = right?.dismisses === true;
  const leftDismisses = left?.dismisses === true;

  const pan = Gesture.Pan()
    .enabled(enabled && (canSwipeRight || canSwipeLeft))
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      "worklet";
      const minX = canSwipeLeft ? -MAX_SWIPE : 0;
      const maxX = canSwipeRight ? MAX_SWIPE : 0;
      translateX.set(Math.max(minX, Math.min(maxX, e.translationX)));
      const past = Math.abs(translateX.get()) >= ACTION_THRESHOLD;
      if (past !== armed.get()) {
        armed.set(past);
        if (past) scheduleOnRN(pulse);
      }
    })
    .onEnd(() => {
      "worklet";
      const x = translateX.get();
      armed.set(false);
      if (x >= ACTION_THRESHOLD && canSwipeRight) {
        if (rightDismisses) {
          translateX.set(
            withTiming(DISMISS_X, { duration: 180 }, () => {
              scheduleOnRN(runRight);
            }),
          );
          return;
        }
        translateX.set(withSpring(0, SPRING));
        scheduleOnRN(runRight);
        return;
      }
      if (x <= -ACTION_THRESHOLD && canSwipeLeft) {
        if (leftDismisses) {
          translateX.set(
            withTiming(-DISMISS_X, { duration: 180 }, () => {
              scheduleOnRN(runLeft);
            }),
          );
          return;
        }
        translateX.set(withSpring(0, SPRING));
        scheduleOnRN(runLeft);
        return;
      }
      translateX.set(withSpring(0, SPRING));
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.get(),
      [0, 24, ACTION_THRESHOLD],
      [0, 0.6, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.get(),
      [-ACTION_THRESHOLD, -24, 0],
      [1, 0.6, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={styles.container}>
      {right ? (
        <Animated.View
          style={[
            styles.action,
            styles.rightAction,
            right.destructive ? styles.destructiveAction : styles.accentAction,
            rightActionStyle,
          ]}
          pointerEvents="none"
        >
          <Feather
            name={right.icon}
            size={20}
            color={
              right.destructive
                ? theme.colors.destructiveForeground
                : theme.colors.primaryBase
            }
          />
        </Animated.View>
      ) : null}
      {left ? (
        <Animated.View
          style={[
            styles.action,
            styles.leftAction,
            left.destructive ? styles.destructiveAction : styles.accentAction,
            leftActionStyle,
          ]}
          pointerEvents="none"
        >
          <Feather
            name={left.icon}
            size={20}
            color={
              left.destructive
                ? theme.colors.destructiveForeground
                : theme.colors.primaryBase
            }
          />
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={rowStyle}
          accessibilityActions={accessibilityActions.map(({ name, label }) => ({
            name,
            label,
          }))}
          onAccessibilityAction={(e) => {
            const action = accessibilityActions.find(
              (spec) => spec.name === e.nativeEvent.actionName,
            );
            // Each action toasts its own failures; the row only needs it started.
            if (action) void Promise.resolve(action.run()).catch(() => undefined);
          }}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const getStyles = memoizeStyles(createStyles);

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      overflow: "hidden",
    } as ViewStyle,
    action: {
      ...StyleSheet.absoluteFill,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 28,
    } as ViewStyle,
    rightAction: {
      justifyContent: "flex-start",
    } as ViewStyle,
    leftAction: {
      justifyContent: "flex-end",
    } as ViewStyle,
    accentAction: {
      backgroundColor: theme.colors.primaryBase + "40",
    } as ViewStyle,
    destructiveAction: {
      backgroundColor: theme.colors.destructive,
    } as ViewStyle,
  });
}
