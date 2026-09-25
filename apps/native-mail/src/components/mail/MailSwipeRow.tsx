import React, { useCallback, useMemo } from "react";
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

const ACTION_THRESHOLD = 88;
const MAX_SWIPE = 140;
const SPRING = { damping: 26, stiffness: 260, mass: 0.8 };

interface MailSwipeRowProps {
  children: React.ReactNode;
  enabled: boolean;
  read: boolean;
  onToggleRead: () => void;
  /** Return a promise to keep the row offscreen until the trash settles. */
  onTrash?: () => void | Promise<unknown>;
}

/** Swipe right to toggle read, swipe left to trash. */
export function MailSwipeRow({
  children,
  enabled,
  read,
  onToggleRead,
  onTrash,
}: MailSwipeRowProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const translateX = useSharedValue(0);
  const armed = useSharedValue(false);
  const canTrash = Boolean(onTrash);

  const pulse = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const runTrash = useCallback(() => {
    const reset = () => {
      translateX.value = withSpring(0, SPRING);
    };
    void Promise.resolve(onTrash?.()).then(reset, reset);
  }, [onTrash, translateX]);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      "worklet";
      const minX = canTrash ? -MAX_SWIPE : 0;
      translateX.value = Math.max(minX, Math.min(MAX_SWIPE, e.translationX));
      const past = Math.abs(translateX.value) >= ACTION_THRESHOLD;
      if (past !== armed.value) {
        armed.value = past;
        if (past) scheduleOnRN(pulse);
      }
    })
    .onEnd(() => {
      "worklet";
      const x = translateX.value;
      armed.value = false;
      if (x >= ACTION_THRESHOLD) {
        scheduleOnRN(onToggleRead);
        translateX.value = withSpring(0, SPRING);
        return;
      }
      if (x <= -ACTION_THRESHOLD && canTrash) {
        translateX.value = withTiming(-600, { duration: 180 }, () => {
          scheduleOnRN(runTrash);
        });
        return;
      }
      translateX.value = withSpring(0, SPRING);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const readActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, 24, ACTION_THRESHOLD],
      [0, 0.6, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const trashActionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-ACTION_THRESHOLD, -24, 0],
      [1, 0.6, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const accessibilityActions = useMemo(
    () => [
      { name: "toggleRead", label: read ? "Mark as unread" : "Mark as read" },
      ...(canTrash ? [{ name: "trash", label: "Move to trash" }] : []),
    ],
    [canTrash, read],
  );

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.action, styles.readAction, readActionStyle]}
        pointerEvents="none"
      >
        <Feather
          name={read ? "mail" : "check"}
          size={20}
          color={theme.colors.primaryBase}
        />
      </Animated.View>
      {canTrash ? (
        <Animated.View
          style={[styles.action, styles.trashAction, trashActionStyle]}
          pointerEvents="none"
        >
          <Feather
            name="trash-2"
            size={20}
            color={theme.colors.destructiveForeground}
          />
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={rowStyle}
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "toggleRead") onToggleRead();
            if (e.nativeEvent.actionName === "trash") void onTrash?.();
          }}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

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
    readAction: {
      justifyContent: "flex-start",
      backgroundColor: theme.colors.primaryBase + "40",
    } as ViewStyle,
    trashAction: {
      justifyContent: "flex-end",
      backgroundColor: theme.colors.destructive,
    } as ViewStyle,
  });
}
