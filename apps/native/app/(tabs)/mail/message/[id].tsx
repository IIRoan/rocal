import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../../src/providers/ThemeProvider";
import { QUERY_KEYS } from "../../../../src/lib/query-keys";
import {
  useCachedMessage,
  useMailRuntime,
} from "../../../../src/lib/mail/use-mail";
import {
  formatAddressFull,
  formatMessageDate,
} from "../../../../src/lib/mail/mail-helpers";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "../../../../src/lib/mail/message-security";
import { openWebMail } from "../../../../src/lib/mail/mail-web-bridge";
import type { JmapEmailMessage } from "../../../../src/lib/mail/types";

export default function MailMessageScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const messageId = typeof id === "string" ? id : "";

  const runtimeQuery = useMailRuntime(true);
  const runtime = runtimeQuery.data;
  const cached = useCachedMessage(messageId);

  const messageQuery = useQuery<JmapEmailMessage | null>({
    queryKey: QUERY_KEYS.mailMessage(messageId),
    enabled: Boolean(messageId) && (Boolean(cached) || Boolean(runtime)),
    initialData: cached ?? undefined,
    queryFn: async () => {
      if (cached) return cached;
      const list = await runtime!.client.getMessagesByIds(runtime!.session, [
        messageId,
      ]);
      return list[0] ?? null;
    },
  });

  const message = messageQuery.data ?? null;
  const bodies = message ? extractMessageBodies(message) : null;
  const encryption = message ? classifyMessageEncryption(message) : "plain";
  const isEncrypted = encryption !== "plain";
  const bodyText = bodies?.text ?? bodies?.html ?? null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Back to messages"
        >
          <Feather name="arrow-left" size={22} color={theme.colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {message?.subject?.trim() || "Message"}
        </Text>
        <Pressable
          onPress={() => openWebMail(messageId)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Open in secure web mail"
        >
          <Feather name="external-link" size={20} color={theme.colors.foreground} />
        </Pressable>
      </View>

      {messageQuery.isLoading && !message ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primaryBase} />
        </View>
      ) : messageQuery.isError && !message ? (
        <View style={styles.centered}>
          <Feather
            name="alert-triangle"
            size={36}
            color={theme.colors.destructive}
          />
          <Text style={styles.mutedText}>
            {getErrorMessage(messageQuery.error, "Failed to load message")}
          </Text>
        </View>
      ) : !message ? (
        <View style={styles.centered}>
          <Text style={styles.mutedText}>Message not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.subject}>
            {message.subject?.trim() || "(no subject)"}
          </Text>

          <View style={styles.metaBlock}>
            <MetaRow theme={theme} label="From" value={formatAddressFull(message.from)} />
            <MetaRow theme={theme} label="To" value={formatAddressFull(message.to)} />
            {message.cc?.length ? (
              <MetaRow theme={theme} label="Cc" value={formatAddressFull(message.cc)} />
            ) : null}
            <MetaRow
              theme={theme}
              label="Date"
              value={formatMessageDate(message.receivedAt)}
            />
          </View>

          {(message.attachments?.length ?? 0) > 0 ? (
            <View style={styles.attachmentBlock}>
              {message.attachments!.map((attachment, index) => (
                <View
                  key={attachment.blobId ?? `${attachment.name}-${index}`}
                  style={styles.attachmentChip}
                >
                  <Feather
                    name="paperclip"
                    size={13}
                    color={theme.colors.mutedForeground}
                  />
                  <Text style={styles.attachmentName} numberOfLines={1}>
                    {attachment.name ?? "attachment"}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.divider} />

          {isEncrypted ? (
            <View style={styles.encryptedCard}>
              <Feather name="lock" size={28} color={theme.colors.primaryBase} />
              <Text style={styles.encryptedTitle}>
                End-to-end encrypted message
              </Text>
              <Text style={styles.mutedText}>
                This message is encrypted with your private key. Open it in the
                secure web client to read it.
              </Text>
              <Pressable
                onPress={() => openWebMail(messageId)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  Open in secure web mail
                </Text>
              </Pressable>
            </View>
          ) : bodyText ? (
            <Text style={styles.bodyText}>{bodyText}</Text>
          ) : (
            <Text style={styles.mutedText}>This message has no content.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MetaRow({
  theme,
  label,
  value,
}: {
  theme: ThemeTokens;
  label: string;
  value: string;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconButton: {
      width: 38,
      height: 38,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["6"],
    },
    body: {
      padding: theme.spacing["4"],
      gap: theme.spacing["3"],
    },
    metaBlock: {
      gap: theme.spacing["1"],
    },
    metaRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["2"],
    },
    attachmentBlock: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: theme.spacing["2"],
    },
    attachmentChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      maxWidth: 200,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
    encryptedCard: {
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      padding: theme.spacing["4"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    primaryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    subject: {
      fontSize: theme.typography.fontSize.xl.size,
      lineHeight: theme.typography.fontSize.xl.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    metaLabel: {
      width: 44,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    metaValue: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    attachmentName: {
      flexShrink: 1,
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.foreground,
    },
    bodyText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    mutedText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    encryptedTitle: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
