import React, { useMemo } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { MAIL_ICON, MAIL_LAYOUT, mailSpacing } from "./mail-ui";

export const MAIL_COMPOSE_BUTTON_SIZE = MAIL_LAYOUT.composeFabSize;
export const MAIL_COMPOSE_LIST_EXTRA = MAIL_LAYOUT.composeListExtra;

interface MailComposeButtonProps {
  bottomInset: number;
  onPress: () => void;
}

/** Compact FAB — same 44px height as sidebar primary actions. */
export function MailComposeButton({ bottomInset, onPress }: MailComposeButtonProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pad = mailSpacing(theme);

  return (
    <View
      style={[
        styles.wrap,
        {
          bottom: Math.max(bottomInset, pad.section) + MAIL_LAYOUT.composeFabInset,
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        accessibilityRole="button"
        accessibilityLabel="Compose message"
      >
        <Feather
          name="edit"
          size={MAIL_ICON.fab}
          color={theme.colors.primaryForeground}
        />
      </Pressable>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const size = MAIL_LAYOUT.composeFabSize;

  return StyleSheet.create({
    wrap: {
      position: "absolute",
      right: pad.headerH,
      zIndex: 10,
    } as ViewStyle,
    fab: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primaryBase,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
    } as ViewStyle,
    fabPressed: {
      opacity: 0.85,
    } as ViewStyle,
  });
}
