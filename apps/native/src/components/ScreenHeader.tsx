import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useSidebar } from "../providers/SidebarProvider";
import { useCommandPalette } from "../providers/CommandPaletteProvider";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ScreenHeaderProps {
  /** Title displayed in the header. */
  title: string;
  /**
   * Optional right-side action. When omitted, a command palette / search
   * button is shown by default.
   */
  rightAction?: React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ScreenHeader({ title, rightAction }: ScreenHeaderProps) {
  const { theme } = useTheme();
  const { toggle } = useSidebar();
  const { open: openCommandPalette } = useCommandPalette();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={toggle}
        style={styles.menuButton}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Feather name="menu" size={22} color={theme.colors.foreground} />
      </Pressable>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      {rightAction ? (
        <View style={styles.rightSlot}>{rightAction}</View>
      ) : (
        <Pressable
          onPress={openCommandPalette}
          style={styles.rightSlot}
          accessibilityRole="button"
          accessibilityLabel="Search and commands"
        >
          <Feather name="search" size={20} color={theme.colors.foreground} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      backgroundColor: theme.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    menuButton: {
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
    },
    rightSlot: {
      minWidth: 38,
      alignItems: "flex-end" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    title: {
      flex: 1,
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
