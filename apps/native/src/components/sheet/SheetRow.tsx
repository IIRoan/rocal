import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SheetRowProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  accessory?: React.ComponentProps<typeof Feather>["name"];
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
  showDivider?: boolean;
  iconColor?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SheetRow({
  icon,
  label,
  accessory,
  destructive,
  disabled,
  onPress,
  showDivider,
  iconColor: iconColorProp,
}: SheetRowProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const iconColor =
    iconColorProp ??
    (destructive ? theme.colors.destructive : theme.colors.mutedForeground);
  const textColor = destructive ? theme.colors.destructive : theme.colors.foreground;

  return (
    <View>
      {showDivider ? <View style={styles.divider} /> : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.row,
          pressed && styles.rowPressed,
          disabled && styles.rowDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Feather name={icon} size={18} color={iconColor} />
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        {accessory ? (
          <Feather
            name={accessory}
            size={16}
            color={theme.colors.mutedForeground}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border + "50",
      marginLeft: 44,
    } as ViewStyle,
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    } as ViewStyle,
    rowPressed: {
      opacity: 0.6,
    } as ViewStyle,
    rowDisabled: {
      opacity: 0.45,
    } as ViewStyle,
    label: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
    } as TextStyle,
  });
}
