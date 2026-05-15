import { useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useTheme, type ThemePreference } from "../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

/**
 * A compact theme toggle button that cycles through light → dark → system.
 * Renders a sun (☀), moon (☾), or auto (◐) icon depending on the current
 * preference.
 */
export function ThemeToggle() {
  const { theme, themePreference, setThemePreference } = useTheme();
  const styles = createStyles(theme);

  const icon =
    themePreference === "light" ? "☀" : themePreference === "dark" ? "☾" : "◐";

  const nextLabel =
    themePreference === "light"
      ? "dark"
      : themePreference === "dark"
        ? "system"
        : "light";

  const cycle = useCallback(() => {
    const next: Record<ThemePreference, ThemePreference> = {
      light: "dark",
      dark: "system",
      system: "light",
    };
    setThemePreference(next[themePreference]);
  }, [themePreference, setThemePreference]);

  return (
    <Pressable
      onPress={cycle}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${nextLabel} theme`}
      accessibilityHint={`Current theme: ${themePreference}`}
      hitSlop={8}
    >
      <Text style={styles.icon}>{icon}</Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    button: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.muted,
    },
    pressed: {
      opacity: 0.7,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    icon: {
      fontSize: 20,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
