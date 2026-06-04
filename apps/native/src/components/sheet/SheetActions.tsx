import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SheetActionsProps {
  children: React.ReactNode;
}

export interface SheetPrimaryButtonProps {
  label: string;
  icon?: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export interface SheetSecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

// ─── Container ─────────────────────────────────────────────────────────────

export function SheetActions({ children }: SheetActionsProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createSheetActionsStyles(theme, insets.bottom);

  return <View style={styles.container}>{children}</View>;
}

// ─── Primary Button ──────────────────────────────────────────────────────────

export function SheetPrimaryButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
}: SheetPrimaryButtonProps) {
  const { theme } = useTheme();
  const styles = createPrimaryStyles(theme);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
      ) : (
        <>
          {icon ? (
            <Feather
              name={icon}
              size={14}
              color={theme.colors.primaryForeground}
            />
          ) : null}
          <Text style={styles.text}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ─── Secondary Button ────────────────────────────────────────────────────────

export function SheetSecondaryButton({
  label,
  onPress,
  disabled,
}: SheetSecondaryButtonProps) {
  const { theme } = useTheme();
  const styles = createSecondaryStyles(theme);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createSheetActionsStyles(theme: ThemeTokens, bottomInset: number) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Math.max(bottomInset, 12),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border + "66",
      backgroundColor: theme.colors.card,
    } as ViewStyle,
  });
}

function createPrimaryStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    button: {
      flex: 1,
      minHeight: 46,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.primaryBase,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    } as ViewStyle,
    pressed: {
      opacity: 0.9,
    } as ViewStyle,
    disabled: {
      opacity: 0.55,
    } as ViewStyle,
    text: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    } as TextStyle,
  });
}

function createSecondaryStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    button: {
      minHeight: 46,
      paddingHorizontal: 18,
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    pressed: {
      backgroundColor: theme.colors.accent,
    } as ViewStyle,
    disabled: {
      opacity: 0.55,
    } as ViewStyle,
    text: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } as TextStyle,
  });
}
