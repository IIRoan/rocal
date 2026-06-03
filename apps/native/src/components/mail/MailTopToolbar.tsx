import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { MAIL_ICON, mailSpacing } from "./mail-ui";

interface MailTopToolbarProps {
  onMenu: () => void;
  onSearch: () => void;
}

/** Matches {@link ScreenHeader} / {@link CalendarViewSwitcher} chrome. */
export function MailTopToolbar({ onMenu, onSearch }: MailTopToolbarProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onMenu}
        style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Feather name="menu" size={MAIL_ICON.headerMenu} color={theme.colors.foreground} />
      </Pressable>

      <View style={styles.spacer} />

      <Pressable
        onPress={onSearch}
        style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Search mail"
      >
        <Feather name="search" size={MAIL_ICON.headerSearch} color={theme.colors.foreground} />
      </Pressable>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);

  return StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: pad.headerH,
      paddingVertical: pad.headerV,
      backgroundColor: theme.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    } as ViewStyle,
    menuButton: {
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
    } as ViewStyle,
    searchButton: {
      minWidth: 38,
      alignItems: "flex-end",
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
    } as ViewStyle,
    spacer: {
      flex: 1,
    } as ViewStyle,
    pressed: {
      opacity: 0.6,
    } as ViewStyle,
  });
}
