import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  COMPOSE_SIGNED_DESCRIPTION,
  COMPOSE_SIGNED_LABEL,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import type { DraftSaveStatus } from "../../hooks/use-compose-draft-autosave";
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";

type ComposeFormatBarProps = {
  draftSaveStatus: DraftSaveStatus;
  /** Plain-text compose sends no HTML, so the formatting buttons are hidden. */
  plainTextMode?: boolean;
  /** "Sign messages with my key" is on. */
  signed?: boolean;
  onBold: () => void;
  onItalic: () => void;
  onUnderline: () => void;
  onList: () => void;
  onChooseSignature: () => void;
  onInsertTemplate: () => void;
};

export function ComposeFormatBar({
  draftSaveStatus,
  plainTextMode = false,
  signed = false,
  onBold,
  onItalic,
  onUnderline,
  onList,
  onChooseSignature,
  onInsertTemplate,
}: ComposeFormatBarProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const buttonStyle = ({ pressed }: { pressed: boolean }) => [
    styles.formatButton,
    pressed && styles.pressed,
  ];

  return (
    <View style={styles.formatBar}>
      <View style={styles.formatToolbar}>
        {plainTextMode ? null : (
          <>
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
          </>
        )}
        <Pressable
          onPress={onChooseSignature}
          accessibilityRole="button"
          accessibilityLabel="Signature"
          style={buttonStyle}
        >
          <Feather name="edit-3" size={16} color={theme.colors.foreground} />
        </Pressable>
        <Pressable
          onPress={onInsertTemplate}
          accessibilityRole="button"
          accessibilityLabel="Insert template"
          style={buttonStyle}
        >
          <Feather name="file-text" size={16} color={theme.colors.foreground} />
        </Pressable>
      </View>
      {draftSaveStatus === "saving" ? (
        <Text style={styles.draftStatus}>Saving…</Text>
      ) : draftSaveStatus === "saved" ? (
        <Text style={styles.draftStatus}>Saved</Text>
      ) : draftSaveStatus === "error" ? (
        <Text style={[styles.draftStatus, styles.draftStatusError]}>
          Save failed
        </Text>
      ) : signed ? (
        <View
          style={styles.signed}
          accessible
          accessibilityLabel={`${COMPOSE_SIGNED_LABEL}. ${COMPOSE_SIGNED_DESCRIPTION}`}
          testID="compose-signed"
        >
          <Feather name="pen-tool" size={14} color={skin.textTertiary} />
          <Text style={styles.draftStatus}>Signed</Text>
        </View>
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
    signed: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingLeft: theme.spacing["2"],
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
