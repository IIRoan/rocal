import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SheetNavButtonProps {
  label: string;
  onPress: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SheetNavButton({ label, onPress }: SheetNavButtonProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <Pressable
      onPress={onPress}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name="chevron-left" size={20} color={theme.colors.mutedForeground} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 16,
      paddingBottom: 4,
    } as ViewStyle,
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    } as TextStyle,
  });
}
