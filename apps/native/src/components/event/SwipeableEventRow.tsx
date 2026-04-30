import { useCallback, useMemo } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Width of the delete action area revealed behind the row */
const DELETE_ACTION_WIDTH = 80;

/** Swipe threshold to trigger the delete action (percentage of action width) */
const DELETE_THRESHOLD = 0.6;

/** Spring config for snap animations */
const SPRING_CONFIG = { damping: 20, stiffness: 200 };

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SwipeableEventRowProps {
  /** Unique identifier for the event (used in accessibility) */
  eventId: string;
  /** Display title for the event (used in confirmation dialog) */
  eventTitle: string;
  /** The content to render inside the swipeable row */
  children: React.ReactNode;
  /** Callback when the user confirms deletion */
  onDelete: (eventId: string) => void;
  /** Whether swipe-to-delete is enabled (default: true) */
  enabled?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SwipeableEventRow({
  eventId,
  eventTitle,
  children,
  onDelete,
  enabled = true,
}: SwipeableEventRowProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ── Shared values for gesture animation ──────────────────────────────────

  const translateX = useSharedValue(0);
  const hasReachedThreshold = useSharedValue(false);

  // ── Haptic feedback (runs on JS thread) ──────────────────────────────────

  const triggerThresholdHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // ── Delete confirmation (runs on JS thread) ─────────────────────────────

  const showDeleteConfirmation = useCallback(() => {
    Alert.alert(
      "Delete event?",
      `Are you sure you want to delete "${eventTitle}"? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            // Snap back to closed position
            translateX.value = withSpring(0, SPRING_CONFIG);
          },
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            // Animate row off-screen then trigger delete
            translateX.value = withTiming(-500, { duration: 200 }, () => {
              runOnJS(onDelete)(eventId);
            });
          },
        },
      ],
    );
  }, [eventId, eventTitle, onDelete, translateX]);

  // ── Gesture definition ───────────────────────────────────────────────────

  const panGesture = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart(() => {
      hasReachedThreshold.value = false;
    })
    .onUpdate((e) => {
      // Only allow swiping left (negative translationX), clamp to max
      const clampedX = Math.min(0, Math.max(e.translationX, -DELETE_ACTION_WIDTH * 1.5));
      translateX.value = clampedX;

      // Check if we've crossed the delete threshold
      const thresholdReached = Math.abs(clampedX) >= DELETE_ACTION_WIDTH * DELETE_THRESHOLD;
      if (thresholdReached && !hasReachedThreshold.value) {
        hasReachedThreshold.value = true;
        runOnJS(triggerThresholdHaptic)();
      } else if (!thresholdReached && hasReachedThreshold.value) {
        hasReachedThreshold.value = false;
      }
    })
    .onEnd(() => {
      const shouldTriggerDelete =
        Math.abs(translateX.value) >= DELETE_ACTION_WIDTH * DELETE_THRESHOLD;

      if (shouldTriggerDelete) {
        // Snap to reveal the full delete action, then show confirmation
        translateX.value = withSpring(-DELETE_ACTION_WIDTH, SPRING_CONFIG, () => {
          runOnJS(showDeleteConfirmation)();
        });
      } else {
        // Snap back to closed position
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // ── Animated styles ──────────────────────────────────────────────────────

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteActionAnimatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / (DELETE_ACTION_WIDTH * 0.5)),
  }));

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Delete action revealed behind the row */}
      <Animated.View
        style={[styles.deleteAction, deleteActionAnimatedStyle]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.deleteText}>Delete</Text>
      </Animated.View>

      {/* Swipeable row content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[styles.rowContent, rowAnimatedStyle]}
          accessibilityActions={[{ name: "delete", label: "Delete event" }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "delete") {
              showDeleteConfirmation();
            }
          }}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      overflow: "hidden" as const,
      backgroundColor: theme.colors.destructive,
    },
    deleteAction: {
      position: "absolute" as const,
      right: 0,
      top: 0,
      bottom: 0,
      width: DELETE_ACTION_WIDTH,
      backgroundColor: theme.colors.destructive,
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    rowContent: {
      backgroundColor: theme.colors.card,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    deleteText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.destructiveForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

// Export constants for testing
export { DELETE_ACTION_WIDTH, DELETE_THRESHOLD, SPRING_CONFIG };

export type { SwipeableEventRowProps as SwipeableEventRowPropsType };
