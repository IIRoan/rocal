import { useMemo } from "react";
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
import { useTheme } from "../../providers/ThemeProvider";
import type { DraftSaveStatus } from "../../hooks/use-compose-draft-autosave";
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "./mail-ui";

type ComposeFormatBarProps = {
  draftSaveStatus: DraftSaveStatus;
  hasSignature: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onList: () => void;
  onInsertSignature: () => void;
};

export function ComposeFormatBar({
  draftSaveStatus,
  hasSignature,
  onBold,
  onItalic,
  onUnderline,
  onList,
  onInsertSignature,
}: ComposeFormatBarProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const buttonStyle = ({ pressed }: { pressed: boolean }) => [
    styles.formatButton,
    pressed && styles.pressed,
  ];

  return (
    <View style={styles.formatBar}>
      <View style={styles.formatToolbar}>
        <Pressable
          onPressIn={onBold}
          accessibilityRole="button"
          accessibilityLabel="Bold"
          style={buttonStyle}
        >
          <Text style={styles.formatButtonText}>B</Text>
        </Pressable>
        <Pressable
          onPressIn={onItalic}
          accessibilityRole="button"
          accessibilityLabel="Italic"
          style={buttonStyle}
        >
          <Text style={[styles.formatButtonText, styles.formatItalic]}>I</Text>
        </Pressable>
        <Pressable
          onPressIn={onUnderline}
          accessibilityRole="button"
          accessibilityLabel="Underline"
          style={buttonStyle}
        >
          <Text style={[styles.formatButtonText, styles.formatUnderline]}>
            U
          </Text>
        </Pressable>
        <Pressable
          onPressIn={onList}
          accessibilityRole="button"
          accessibilityLabel="List"
          style={buttonStyle}
        >
          <Feather name="list" size={16} color={theme.colors.foreground} />
        </Pressable>
        {hasSignature ? (
          <Pressable
            onPress={onInsertSignature}
            accessibilityRole="button"
            accessibilityLabel="Insert signature"
            style={buttonStyle}
          >
            <Feather name="edit-3" size={16} color={theme.colors.foreground} />
          </Pressable>
        ) : null}
      </View>
      {draftSaveStatus === "saving" ? (
        <Text style={styles.draftStatus}>Saving…</Text>
      ) : draftSaveStatus === "saved" ? (
        <Text style={styles.draftStatus}>Saved</Text>
      ) : draftSaveStatus === "error" ? (
        <Text style={[styles.draftStatus, styles.draftStatusError]}>
          Save failed
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    formatBar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      flexShrink: 0,
      minHeight: MAIL_LAYOUT.hitSize,
      paddingHorizontal: theme.spacing["2"],
      backgroundColor: theme.colors.card,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: skin.borderTertiary,
    },
    formatToolbar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    formatButton: {
      minWidth: MAIL_LAYOUT.hitSize,
      height: MAIL_LAYOUT.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
    },
    pressed: {
      backgroundColor: skin.pressed,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    formatButtonText: {
      fontSize: skin.body.fontSize,
      fontWeight: "700" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    formatItalic: {
      fontStyle: "italic" as const,
      fontWeight: "500" as TextStyle["fontWeight"],
    },
    formatUnderline: {
      textDecorationLine: "underline" as const,
    },
    draftStatus: {
      ...skin.meta,
      paddingRight: theme.spacing["2"],
    },
    draftStatusError: {
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
