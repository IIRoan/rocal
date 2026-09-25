import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { resolveAttachmentPreviewKind } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { formatAttachmentSize } from "../../lib/mail/compose-attachments";
import {
  formatAttachmentCount,
  readerAttachmentIcon,
} from "../../lib/mail/reader-recipients";
import type { JmapAttachment } from "../../lib/mail/types";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";

type MailAttachmentCardsProps = {
  attachments: JmapAttachment[];
  downloadingBlobId: string | null;
  onOpenAttachment: (attachment: JmapAttachment, cacheKey: string) => void;
};

export function MailAttachmentCards({
  attachments,
  downloadingBlobId,
  onOpenAttachment,
}: MailAttachmentCardsProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);

  if (attachments.length === 0) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.caption}>
        {formatAttachmentCount(attachments.length)}
      </Text>
      <View style={styles.grid}>
        {attachments.map((attachment, index) => {
          const key = attachment.blobId ?? `inline-${index}`;
          const isDownloading = downloadingBlobId === key;
          const previewKind = resolveAttachmentPreviewKind({
            name: attachment.name,
            type: attachment.type,
          });
          const sizeLabel =
            typeof attachment.size === "number" && attachment.size > 0
              ? formatAttachmentSize(attachment.size)
              : attachment.type?.split("/")[1]?.toUpperCase();

          return (
            <Pressable
              key={key}
              onPress={() => onOpenAttachment(attachment, key)}
              disabled={isDownloading}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${previewKind ? "Preview" : "Download"} ${attachment.name ?? "attachment"}`}
            >
              {isDownloading ? (
                <ActivityIndicator size={16} color={skin.textSecondary} />
              ) : (
                <Feather
                  name={readerAttachmentIcon(previewKind)}
                  size={16}
                  color={skin.textSecondary}
                />
              )}
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>
                  {attachment.name ?? "attachment"}
                </Text>
                {sizeLabel ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {sizeLabel}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  return StyleSheet.create({
    root: {
      gap: theme.spacing["2"],
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: theme.spacing["2"],
    },
    card: {
      width: "48.5%",
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: skin.borderPrimary,
      backgroundColor: skin.surface,
    },
    cardPressed: {
      backgroundColor: skin.pressed,
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    caption: skin.meta,
    name: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "600",
      color: theme.colors.foreground,
    },
    meta: {
      ...skin.meta,
      fontSize: 12,
      lineHeight: 16,
    },
  });
}
