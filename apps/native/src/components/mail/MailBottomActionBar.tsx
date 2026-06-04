import React, { useMemo } from "react";
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
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import {
  MAIL_ICON,
  MAIL_LAYOUT,
  mailColors,
  mailSpacing,
  mailTypography,
} from "./mail-ui";

interface MailBottomActionBarProps {
  bottomInset: number;
  children: React.ReactNode;
}

/**
 * Fixed bottom dock for mail list bulk actions and message reader.
 * Always absolutely positioned so both screens share identical layout.
 */
export function MailBottomActionBar({
  bottomInset,
  children,
}: MailBottomActionBarProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createBarStyles(theme), [theme]);
  const pad = mailSpacing(theme);

  return (
    <View
      style={[
        styles.dock,
        {
          paddingTop: MAIL_LAYOUT.bottomBarPaddingTop,
          paddingBottom: bottomInset,
          paddingHorizontal: pad.headerH,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.actionsRow}>{children}</View>
    </View>
  );
}

export function MailBottomActionDivider() {
  const { theme } = useTheme();
  const colors = mailColors(theme);

  return (
    <View style={[stylesStatic.divider, { backgroundColor: colors.border }]} />
  );
}

export interface MailBottomActionProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

export function MailBottomAction({
  icon,
  label,
  onPress,
  destructive,
  disabled,
  loading,
}: MailBottomActionProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createActionStyles(theme), [theme]);
  const type = mailTypography(theme);
  const iconColor = destructive
    ? theme.colors.destructive
    : theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.action,
        pressed && styles.actionPressed,
        (disabled || loading) && styles.actionDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <Feather name={icon} size={MAIL_ICON.toolbar} color={iconColor} />
      )}
      <Text
        style={[
          type.caption,
          styles.label,
          destructive && styles.labelDestructive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const stylesStatic = StyleSheet.create({
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  } as ViewStyle,
});

function createBarStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    dock: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    } as ViewStyle,
    actionsRow: {
      flexDirection: "row",
      alignItems: "stretch",
      height: MAIL_LAYOUT.bottomBarHeight,
    } as ViewStyle,
  });
}

function createActionStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);

  return StyleSheet.create({
    action: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: pad.tight,
    } as ViewStyle,
    actionPressed: {
      opacity: 0.65,
    } as ViewStyle,
    actionDisabled: {
      opacity: 0.45,
    } as ViewStyle,
    label: {
      color: theme.colors.foreground,
    } as TextStyle,
    labelDestructive: {
      color: theme.colors.destructive,
    } as TextStyle,
  });
}
