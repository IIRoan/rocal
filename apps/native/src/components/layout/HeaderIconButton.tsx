import React, { useMemo } from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { LAYOUT_ICON, layoutSideSlot } from "../../lib/app-layout";

type HeaderIconName = keyof typeof Feather.glyphMap;

interface HeaderIconButtonProps {
  name: HeaderIconName;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
  disabled?: boolean;
}

export function HeaderIconButton({
  name,
  onPress,
  accessibilityLabel,
  size = LAYOUT_ICON.action,
  color,
  disabled,
}: HeaderIconButtonProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const iconColor = color ?? theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Feather name={name} size={size} color={iconColor} />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    button: layoutSideSlot(theme),
    pressed: { opacity: 0.6 } as ViewStyle,
    disabled: { opacity: 0.4 } as ViewStyle,
  });
}
