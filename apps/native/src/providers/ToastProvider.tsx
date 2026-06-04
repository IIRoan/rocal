import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "./ThemeProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOAST_DURATION = 3200;
const EXIT_DURATION = 220;
const SWIPE_DISMISS_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 600;

// ---------------------------------------------------------------------------
// Variant config
// ---------------------------------------------------------------------------

function getVariantConfig(
  variant: ToastVariant,
  theme: ThemeTokens,
): {
  icon: React.ComponentProps<typeof Feather>["name"];
  iconColor: string;
} {
  switch (variant) {
    case "success":
      return { icon: "check", iconColor: "#16a34a" };
    case "error":
      return { icon: "x-circle", iconColor: theme.colors.destructive };
    case "info":
    default:
      return { icon: "info", iconColor: theme.colors.mutedForeground };
  }
}

// ---------------------------------------------------------------------------
// Toast item component
// ---------------------------------------------------------------------------

function ToastItem({
  item,
  onRemove,
}: {
  item: ToastMessage;
  onRemove: (id: number) => void;
}) {
  const { theme } = useTheme();
  const config = getVariantConfig(item.variant, theme);

  const translateY = useSharedValue(90);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.94);
  const gestureTranslateY = useSharedValue(0);
  const isDismissing = useRef(false);

  const triggerDismiss = useCallback(() => {
    if (isDismissing.current) return;
    isDismissing.current = true;
    opacity.value = withTiming(0, { duration: EXIT_DURATION });
    translateY.value = withTiming(
      80,
      { duration: EXIT_DURATION },
      (finished) => {
        if (finished) runOnJS(onRemove)(item.id);
      },
    );
    scale.value = withTiming(0.92, { duration: EXIT_DURATION });
  }, [item.id, onRemove, opacity, scale, translateY]);

  useEffect(() => {
    translateY.value = withSpring(0, {
      damping: 24,
      stiffness: 320,
      mass: 0.8,
    });
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });

    if (item.variant === "error") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (item.variant === "success") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const timer = setTimeout(() => triggerDismiss(), TOAST_DURATION);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panGesture = Gesture.Pan()
    .activeOffsetY([10, Infinity])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        gestureTranslateY.value = e.translationY;
        opacity.value = Math.max(0, 1 - e.translationY / 120);
      }
    })
    .onEnd((e) => {
      if (
        e.translationY > SWIPE_DISMISS_THRESHOLD ||
        e.velocityY > SWIPE_VELOCITY_THRESHOLD
      ) {
        runOnJS(triggerDismiss)();
      } else {
        gestureTranslateY.value = withSpring(0, { damping: 20, stiffness: 300 });
        opacity.value = withTiming(1, { duration: 150 });
      }
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(triggerDismiss)();
  });

  const combinedGesture = Gesture.Race(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value + gestureTranslateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={combinedGesture}>
      <Animated.View
        style={[
          styles.card,
          animatedStyle,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.borderRadius.xl,
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
              },
              android: { elevation: 4 },
            }),
          },
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={item.message}
      >
        <Feather
          name={config.icon}
          size={15}
          color={config.iconColor}
          style={styles.icon}
        />
        <Text
          style={[
            styles.message,
            {
              color: theme.colors.foreground,
              fontSize: theme.typography.fontSize.sm.size,
              lineHeight: theme.typography.fontSize.sm.lineHeight,
              fontWeight:
                theme.typography.fontWeight
                  .medium as import("react-native").TextStyle["fontWeight"],
            },
          ]}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const insets = useSafeAreaInsets();

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
    },
    [],
  );

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  const bottomOffset = insets.bottom + 16;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        style={[styles.overlay, { bottom: bottomOffset }]}
        pointerEvents="box-none"
      >
        {toasts.map((item) => (
          <ToastItem key={item.id} item={item} onRemove={remove} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
    alignItems: "stretch",
    pointerEvents: "box-none",
    gap: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  icon: {
    flexShrink: 0,
  },
  message: {
    flex: 1,
  },
});
