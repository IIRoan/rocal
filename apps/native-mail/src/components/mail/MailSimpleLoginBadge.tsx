import React, { useMemo } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";

export function MailSimpleLoginBadge({ alias }: { alias: string | null }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const detail = alias
    ? `Forwarded by SimpleLogin. The sender only sees your alias ${alias}.`
    : "Forwarded by SimpleLogin. The sender only sees your alias.";

  return (
    <Pressable
      style={styles.badge}
      onPress={() => Alert.alert("via SimpleLogin", detail)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={alias ? `via SimpleLogin, ${alias}` : "via SimpleLogin"}
    >
      <Feather name="shuffle" size={10} color={theme.colors.mutedForeground} />
      <Text style={styles.text} numberOfLines={1}>
        SimpleLogin
      </Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    badge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      maxWidth: 110,
      paddingHorizontal: theme.spacing["1.5"],
      paddingVertical: 2,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.secondary,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    text: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
