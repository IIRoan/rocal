import { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  formatAttachmentSize,
  type PendingComposeAttachment,
} from "../../lib/mail/compose-attachments";
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";

type ComposeAttachmentListProps = {
  attachments: PendingComposeAttachment[];
  onRemove: (id: string) => void;
};

export function ComposeAttachmentList({
  attachments,
  onRemove,
}: ComposeAttachmentListProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {attachments.map((attachment) => (
        <View key={attachment.id} style={styles.card}>
          <Feather name="file" size={16} color={skin.textSecondary} />
          <View style={styles.cardText}>
            <Text style={styles.name} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Text style={styles.size}>
              {formatAttachmentSize(attachment.size)}
            </Text>
          </View>
          <Pressable
            onPress={() => onRemove(attachment.id)}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${attachment.name}`}
          >
            <Feather name="x" size={14} color={skin.textTertiary} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    scroll: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: skin.borderTertiary,
    },
    content: {
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
    },
    card: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      maxWidth: 240,
      minHeight: MAIL_LAYOUT.hitSize,
      paddingLeft: theme.spacing["3"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: skin.borderPrimary,
      backgroundColor: skin.surface,
    },
    cardText: {
      flexShrink: 1,
      minWidth: 0,
    },
    remove: {
      width: MAIL_LAYOUT.hitSize,
      height: MAIL_LAYOUT.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.lg,
    },
    pressed: {
      backgroundColor: skin.pressed,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    name: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    size: {
      fontSize: 11,
      lineHeight: 14,
      color: skin.textTertiary,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
