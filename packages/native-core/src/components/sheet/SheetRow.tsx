import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import { MAIL_ICON } from "../mail/mail-ui";

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
  /** Tighter rhythm aligned with native mail screens. */
  variant?: "default" | "mail";
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
  variant = "default",
}: SheetRowProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, variant);
  const iconSize = variant === "mail" ? MAIL_ICON.sheet : 18;
  const accessorySize = variant === "mail" ? MAIL_ICON.sheetAccessory : 16;

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
        <Feather name={icon} size={iconSize} color={iconColor} />
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        {accessory ? (
          <Feather
            name={accessory}
            size={accessorySize}
            color={theme.colors.mutedForeground}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens, variant: "default" | "mail") {
  const isMail = variant === "mail";
  const iconCol = isMail ? MAIL_ICON.sheet : 18;
  const rowPadH = isMail ? theme.spacing["4"] : 14;
  const rowPadV = isMail ? theme.spacing["3"] : 13;

  return StyleSheet.create({
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border + "50",
      marginLeft: rowPadH + iconCol + 12,
    } as ViewStyle,
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["3"],
      paddingHorizontal: rowPadH,
      paddingVertical: rowPadV,
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
