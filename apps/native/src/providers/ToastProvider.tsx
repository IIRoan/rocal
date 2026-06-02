import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
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

const TOAST_DURATION = 2800;

// ---------------------------------------------------------------------------
// Variant config — uses the same icon-box + muted-tint pattern as EventSheet
// ---------------------------------------------------------------------------

function getVariantConfig(
  variant: ToastVariant,
  theme: ThemeTokens,
): {
  icon: React.ComponentProps<typeof Feather>["name"];
  iconColor: string;
  iconBg: string;
  tintBg: string;
} {
  switch (variant) {
    case "success":
      return {
        icon: "check",
        iconColor: "#16a34a",
        iconBg: "#16a34a" + "18",
        tintBg: theme.colors.muted + "28",
      };
    case "error":
      return {
        icon: "x",
        iconColor: theme.colors.destructive,
        iconBg: theme.colors.destructive + "18",
        tintBg: theme.colors.destructive + "0D",
      };
    case "info":
    default:
      return {
        icon: "info",
        iconColor: theme.colors.mutedForeground,
        iconBg: theme.colors.mutedForeground + "18",
        tintBg: theme.colors.muted + "28",
      };
  }
}

// ---------------------------------------------------------------------------
// Toast item component
// ---------------------------------------------------------------------------

function ToastItem({
  item,
  onDismiss,
}: {
  item: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const config = getVariantConfig(item.variant, theme);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 240,
        mass: 0.7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity,
          transform: [{ translateY }],
          marginTop: insets.top + 6,
          backgroundColor:
            item.variant === "error" ? config.tintBg : theme.colors.card,
        },
      ]}
    >
      <Pressable
        onPress={() => onDismiss(item.id)}
        style={styles.row}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <View style={[styles.iconBox, { backgroundColor: config.iconBg }]}>
          <Feather name={config.icon} size={15} color={config.iconColor} />
        </View>
        <Text
          style={[
            styles.message,
            {
              color: theme.colors.foreground,
              fontSize: theme.typography.fontSize.sm.size,
              lineHeight: theme.typography.fontSize.sm.lineHeight,
            },
          ]}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View style={styles.overlay} pointerEvents="box-none">
        {toasts.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
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
// Styles — mirrors the sectionCard / sectionRow / IconBox pattern from EventSheet
// ---------------------------------------------------------------------------

function createStyles(theme: ThemeTokens) {
  const view = {
    card: {
      width: "88%" as const,
      maxWidth: 380,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      marginBottom: 6,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    iconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    message: {
      flex: 1,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return StyleSheet.create({ ...view, ...text });
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    alignItems: "center" as const,
    pointerEvents: "box-none" as const,
  },
});
