import { useMemo } from "react";
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
import { LAYOUT_ICON } from "../../lib/app-layout";
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "./mail-ui";

const SEND_HEIGHT = 32;
const SEND_HIT_SLOP = (MAIL_LAYOUT.hitSize - SEND_HEIGHT) / 2;

type ComposeHeaderProps = {
  title: string;
  canSend: boolean;
  sending: boolean;
  onClose: () => void;
  onAttach: () => void;
  onMore: () => void;
  onSend: () => void;
};

export function ComposeHeader({
  title,
  canSend,
  sending,
  onClose,
  onAttach,
  onMore,
  onSend,
}: ComposeHeaderProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const sendDisabled = !canSend || sending;

  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        <ComposeIconButton
          icon="x"
          size={LAYOUT_ICON.close}
          label="Close"
          onPress={onClose}
          color={theme.colors.foreground}
          styles={styles}
        />
        <View style={styles.trailing}>
          <ComposeIconButton
            icon="paperclip"
            label="Attach file"
            onPress={onAttach}
            color={theme.colors.foreground}
            styles={styles}
          />
          <ComposeIconButton
            icon="more-horizontal"
            label="More options"
            onPress={onMore}
            color={theme.colors.foreground}
            styles={styles}
          />
          <Pressable
            onPress={onSend}
            disabled={sendDisabled}
            hitSlop={SEND_HIT_SLOP}
            style={({ pressed }) => [
              styles.send,
              !canSend && styles.sendDisabled,
              pressed && !sendDisabled && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: sendDisabled, busy: sending }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={skin.ctaForeground} />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </Pressable>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

function ComposeIconButton({
  icon,
  label,
  onPress,
  color,
  styles,
  size = LAYOUT_ICON.action,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  color: string;
  styles: ReturnType<typeof createStyles>;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={size} color={color} />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    shell: {
      backgroundColor: theme.colors.background,
    },
    bar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      minHeight: MAIL_LAYOUT.hitSize + theme.spacing["1"],
      paddingHorizontal: theme.spacing["1"],
    },
    trailing: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingRight: theme.spacing["3"],
    },
    iconButton: {
      width: MAIL_LAYOUT.hitSize,
      height: MAIL_LAYOUT.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    send: {
      height: SEND_HEIGHT,
      minWidth: 64,
      marginLeft: theme.spacing["1"],
      paddingHorizontal: 14,
      borderRadius: theme.borderRadius.full,
      backgroundColor: skin.cta,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    sendDisabled: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    sendText: {
      fontSize: 15,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: skin.ctaForeground,
    },
    title: {
      ...skin.title,
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["1"],
      paddingBottom: theme.spacing["3"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
