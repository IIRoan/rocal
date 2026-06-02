import { useMemo, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";

export function SheetHeader({
  title,
  leading,
  trailing,
  bordered = true,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Whether to show the bottom border. Defaults to true for backward compatibility. */
  bordered?: boolean;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.header, !bordered && styles.headerBorderless]}>
      <View style={[styles.side, styles.sideStart]}>{leading ?? null}</View>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.side, styles.sideEnd]}>{trailing ?? null}</View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border + "66",
    },
    headerBorderless: {
      borderBottomWidth: 0,
    },
    side: {
      minWidth: 64,
      minHeight: 36,
      justifyContent: "center" as const,
    },
    sideStart: {
      alignItems: "flex-start" as const,
    },
    sideEnd: {
      alignItems: "flex-end" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    title: {
      flex: 1,
      marginHorizontal: 8,
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
