import { useMemo, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

export const EDITOR_CONTROL_HEIGHT = 44;

export function EventEditorRow({
  icon,
  label,
  children,
}: {
  icon: FeatherName;
  label: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createPrimitiveStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <View
        style={styles.rowIcon}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        accessibilityLabel={label}
      >
        <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      </View>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

export function EventEditorChip({
  label,
  onPress,
  accessibilityLabel,
  leadingIcon,
  trailingIcon,
  swatch,
  active = false,
  muted = false,
  style,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  leadingIcon?: FeatherName;
  trailingIcon?: FeatherName;
  swatch?: string;
  active?: boolean;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createPrimitiveStyles(theme), [theme]);
  const textColor = active
    ? theme.colors.primaryForeground
    : muted
      ? theme.colors.mutedForeground
      : theme.colors.foreground;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        pressed && styles.chipPressed,
        active && styles.chipActive,
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
    >
      {leadingIcon ? (
        <Feather name={leadingIcon} size={14} color={textColor} />
      ) : null}
      {swatch ? (
        <View style={[styles.swatch, { backgroundColor: swatch }]} />
      ) : null}
      <Text style={[styles.chipText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
      {trailingIcon ? (
        <Feather
          name={trailingIcon}
          size={14}
          color={theme.colors.mutedForeground}
        />
      ) : null}
    </Pressable>
  );
}

/** Filled field style with a visible resting background so empty fields stay findable. */
export function createEditorFieldStyle(theme: ThemeTokens): TextStyle {
  return {
    minHeight: EDITOR_CONTROL_HEIGHT,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent + "66",
    paddingHorizontal: theme.spacing["3"],
    fontSize: theme.typography.fontSize.sm.size,
    color: theme.colors.foreground,
  };
}

function createPrimitiveStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing["3"],
    },
    rowIcon: {
      width: 20,
      height: EDITOR_CONTROL_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      height: EDITOR_CONTROL_HEIGHT,
      maxWidth: "100%",
      paddingHorizontal: 10,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.accent + "99",
    },
    chipPressed: {
      backgroundColor: theme.colors.accent,
    },
    chipActive: {
      backgroundColor: theme.colors.primaryBase,
    },
    chipText: {
      flexShrink: 1,
      fontSize: theme.typography.fontSize.sm.size,
    },
    swatch: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
    },
  });
}
