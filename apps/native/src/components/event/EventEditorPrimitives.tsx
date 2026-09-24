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
      <Text
        style={[styles.chipText, { color: textColor }]}
        numberOfLines={1}
      >
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

/** Filled container with a leading icon; children render inside (usually a TextInput using createEditorInputStyle). */
export function EventEditorField({
  icon,
  children,
  multiline = false,
  style,
}: {
  icon: FeatherName;
  children: ReactNode;
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createPrimitiveStyles(theme), [theme]);
  return (
    <View style={[styles.field, multiline && styles.fieldMultiline, style]}>
      <View style={multiline ? styles.fieldIconTop : undefined}>
        <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      </View>
      {children}
    </View>
  );
}

export function EventEditorFieldButton({
  label,
  onPress,
  accessibilityLabel,
  icon,
  invalid = false,
  muted = false,
  style,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  icon?: FeatherName;
  invalid?: boolean;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createPrimitiveStyles(theme), [theme]);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.field,
        pressed && styles.fieldPressed,
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? (
        <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      ) : null}
      <Text
        style={[
          styles.fieldText,
          muted && styles.fieldTextMuted,
          invalid && styles.fieldTextInvalid,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Unfilled row aligned with field icons, for toggles and pickers that read as settings. */
export function EventEditorListRow({
  icon,
  leading,
  label,
  muted = false,
  onPress,
  trailing,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityState,
}: {
  icon?: FeatherName;
  leading?: ReactNode;
  label: string;
  muted?: boolean;
  onPress: () => void;
  trailing?: ReactNode;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "switch";
  accessibilityState?: { checked?: boolean };
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createPrimitiveStyles(theme), [theme]);
  return (
    <Pressable
      style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={styles.listRowIcon}>
        {leading ??
          (icon ? (
            <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
          ) : null)}
      </View>
      <Text
        style={[styles.listRowText, muted && styles.listRowTextMuted]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

/** Borderless text input style for use inside EventEditorField. */
export function createEditorInputStyle(theme: ThemeTokens): TextStyle {
  return {
    flex: 1,
    minWidth: 0,
    minHeight: EDITOR_CONTROL_HEIGHT,
    paddingVertical: 0,
    fontSize: theme.typography.fontSize.sm.size,
    color: theme.colors.foreground,
  };
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
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: EDITOR_CONTROL_HEIGHT,
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.accent + "66",
    },
    fieldMultiline: {
      alignItems: "flex-start",
    },
    fieldIconTop: {
      height: EDITOR_CONTROL_HEIGHT,
      justifyContent: "center",
    },
    fieldPressed: {
      backgroundColor: theme.colors.accent,
    },
    fieldText: {
      flexShrink: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    fieldTextMuted: {
      color: theme.colors.mutedForeground,
    },
    fieldTextInvalid: {
      color: theme.colors.destructive,
      textDecorationLine: "line-through",
    },
    listRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: EDITOR_CONTROL_HEIGHT,
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
    },
    listRowPressed: {
      backgroundColor: theme.colors.accent + "66",
    },
    listRowIcon: {
      width: 16,
      alignItems: "center",
    },
    listRowText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    listRowTextMuted: {
      color: theme.colors.mutedForeground,
    },
  });
}
