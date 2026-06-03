import { useMemo, useState } from "react";
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
import { useTheme } from "../../providers/ThemeProvider";
import { formatAddress, formatMessageDate } from "../../lib/mail/mail-helpers";
import { extractMessageBodies } from "../../lib/mail/message-security";
import type { JmapEmailMessage } from "../../lib/mail/types";

interface ConversationThreadStripProps {
  messages: JmapEmailMessage[];
  activeMessageId: string;
  accountEmail?: string | null;
  onSelectMessage: (messageId: string) => void;
}

function buildPreview(message: JmapEmailMessage): string {
  const { text, html } = extractMessageBodies(message);
  const raw = text ?? html?.replace(/<[^>]+>/g, " ") ?? "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function ConversationThreadStrip({
  messages,
  activeMessageId,
  accountEmail,
  onSelectMessage,
}: ConversationThreadStripProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [collapsed, setCollapsed] = useState(false);

  if (messages.length <= 1) {
    return null;
  }

  const ownCount = accountEmail
    ? messages.filter(
        (entry) =>
          entry.from?.[0]?.email?.toLowerCase() === accountEmail.toLowerCase(),
      ).length
    : 0;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setCollapsed((value) => !value)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`${messages.length} messages in thread`}
      >
        <Feather
          name={collapsed ? "chevron-right" : "chevron-down"}
          size={14}
          color={theme.colors.mutedForeground}
        />
        <Feather
          name="message-square"
          size={14}
          color={theme.colors.mutedForeground}
        />
        <Text style={styles.headerText}>
          {messages.length} messages in thread
        </Text>
      </Pressable>

      {!collapsed ? (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {messages.map((threadMessage) => {
            const isActive = threadMessage.id === activeMessageId;
            const sender = formatAddress(threadMessage.from);
            const preview = buildPreview(threadMessage) || "(No body)";
            const isRead =
              threadMessage.keywords?.["$seen"] === true ||
              (accountEmail
                ? threadMessage.from?.[0]?.email?.toLowerCase() ===
                  accountEmail.toLowerCase()
                : false);

            return (
              <Pressable
                key={threadMessage.id}
                onPress={() => onSelectMessage(threadMessage.id)}
                style={[styles.row, isActive && styles.rowActive]}
                accessibilityRole="button"
                accessibilityLabel={`Open message from ${sender}`}
              >
                {!isRead ? <View style={styles.unreadDot} /> : <View style={styles.readSpacer} />}
                <View style={styles.rowContent}>
                  <Text
                    style={[styles.sender, isActive && styles.senderActive]}
                    numberOfLines={1}
                  >
                    {sender}
                  </Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {preview}
                  </Text>
                </View>
                <Text style={styles.date}>
                  {formatMessageDate(threadMessage.receivedAt)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {ownCount > 0 && !collapsed ? (
        <Text style={styles.ownHint}>
          Includes {ownCount} message{ownCount === 1 ? "" : "s"} you sent
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      borderWidth: 1,
      borderColor: theme.colors.border + "80",
      borderRadius: theme.borderRadius.lg,
      overflow: "hidden" as const,
      marginBottom: theme.spacing["3"],
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      backgroundColor: theme.colors.muted + "28",
    },
    list: {
      maxHeight: 160,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border + "60",
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border + "40",
    },
    rowActive: {
      backgroundColor: theme.colors.primaryBase + "12",
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.primaryBase,
    },
    readSpacer: {
      width: 6,
      height: 6,
    },
    rowContent: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    ownHint: {
      paddingHorizontal: theme.spacing["3"],
      paddingBottom: theme.spacing["2"],
      fontSize: theme.typography.fontSize.xs.size - 1,
      color: theme.colors.mutedForeground,
    },
    headerText: {
      flex: 1,
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    sender: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    senderActive: {
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
    },
    preview: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
    date: {
      fontSize: theme.typography.fontSize.xs.size - 1,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
