import { useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useMailSkin, type MailSkin } from "./mail-ui";

export const MAIL_REPLY_FAB_SIZE = 48;

type MailReplyFabProps = {
  bottomInset: number;
  disabled?: boolean;
  onPress: () => void;
};

export function MailReplyFab({
  bottomInset,
  disabled,
  onPress,
}: MailReplyFabProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.fab,
        { bottom: bottomInset + theme.spacing["4"] },
        (pressed || disabled) && styles.dimmed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Reply"
      accessibilityState={{ disabled }}
    >
      <Feather name="corner-up-left" size={20} color={skin.ctaForeground} />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  return StyleSheet.create({
    fab: {
      position: "absolute",
      right: theme.spacing["4"],
      width: MAIL_REPLY_FAB_SIZE,
      height: MAIL_REPLY_FAB_SIZE,
      borderRadius: MAIL_REPLY_FAB_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: skin.cta,
    },
    dimmed: {
      opacity: 0.7,
    },
  });
}
