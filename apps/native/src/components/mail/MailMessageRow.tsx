import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import {
  formatAddress,
  formatMessageDate,
  formatThreadSenders,
  getInitials,
  isMessageFlagged,
  isMessageRead,
} from "../../lib/mail/mail-helpers";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "../../lib/mail/message-security";
import { getAllMessageLabels } from "../../lib/mail/use-labels";
import type { JmapEmailMessage, LabelDef } from "../../lib/mail/types";

interface MailMessageRowProps {
  message: JmapEmailMessage;
  threadMessages?: JmapEmailMessage[];
  threadCount?: number;
  threadUnreadCount?: number;
  hasAttachments?: boolean;
  /** When true, shows recipient ("To") instead of sender (Sent/Drafts). */
  showRecipient?: boolean;
  labels?: LabelDef[];
  onPress: (message: JmapEmailMessage) => void;
  onLongPress?: (message: JmapEmailMessage) => void;
}

function buildPreview(message: JmapEmailMessage): string {
  const { text, html } = extractMessageBodies(message);
  const raw = text ?? html ?? "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 140);
}

function MailMessageRowComponent({
  message,
  threadMessages,
  threadCount = 1,
  threadUnreadCount = 0,
  hasAttachments = false,
  showRecipient = false,
  labels = [],
  onPress,
  onLongPress,
}: MailMessageRowProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const read = threadCount > 1 ? threadUnreadCount === 0 : isMessageRead(message);
  const flagged = isMessageFlagged(message);
  const showThreadBadge = threadCount > 1;
  const encryption = classifyMessageEncryption(message);
  const isEncrypted = encryption !== "plain";
  const messageLabels = getAllMessageLabels(message, labels);
  const addresses = showRecipient ? message.to : message.from;
  const threadSenders =
    threadCount > 1 && threadMessages?.length
      ? formatThreadSenders(threadMessages)
      : null;
  const name = threadSenders ?? formatAddress(addresses);
  const subject = message.subject?.trim() || "(no subject)";
  const preview = isEncrypted
    ? "End-to-end encrypted message"
    : threadCount > 1
      ? `${threadCount} messages · ${buildPreview(message)}`
      : buildPreview(message);

  return (
    <Pressable
      onPress={() => onPress(message)}
      onLongPress={onLongPress ? () => onLongPress(message) : undefined}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${subject}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(addresses)}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.topLine}>
          <Text
            style={[styles.sender, !read && styles.unreadText]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <View style={styles.meta}>
            {showThreadBadge ? (
              <View
                style={[
                  styles.threadBadge,
                  threadUnreadCount > 0 && styles.threadBadgeUnread,
                ]}
              >
                <Feather
                  name="message-square"
                  size={10}
                  color={
                    threadUnreadCount > 0
                      ? theme.colors.primaryBase
                      : theme.colors.mutedForeground
                  }
                />
                <Text
                  style={[
                    styles.threadBadgeText,
                    threadUnreadCount > 0 && styles.threadBadgeTextUnread,
                  ]}
                >
                  {threadUnreadCount > 0 && threadUnreadCount < threadCount
                    ? `${threadUnreadCount}/${threadCount}`
                    : threadCount}
                </Text>
              </View>
            ) : null}
            {hasAttachments ? (
              <Feather
                name="paperclip"
                size={12}
                color={theme.colors.mutedForeground}
                accessibilityLabel="Has attachments"
              />
            ) : null}
            <Text style={styles.date}>{formatMessageDate(message.receivedAt)}</Text>
          </View>
        </View>

        <View style={styles.subjectLine}>
          {isEncrypted ? (
            <Feather
              name="lock"
              size={12}
              color={theme.colors.mutedForeground}
              style={styles.lockIcon}
            />
          ) : null}
          <Text
            style={[styles.subject, !read && styles.unreadText]}
            numberOfLines={1}
          >
            {subject}
          </Text>
          {flagged ? (
            <FontAwesome
              name="star"
              size={12}
              color="#fbbf24"
              style={styles.flagIcon}
            />
          ) : null}
        </View>

        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>

        {messageLabels.length > 0 ? (
          <View style={styles.labelRow}>
            {messageLabels.map((label) => (
              <View
                key={label.id}
                style={[
                  styles.labelChip,
                  { borderColor: `${label.color}50`, backgroundColor: `${label.color}18` },
                ]}
              >
                <View style={[styles.labelDot, { backgroundColor: label.color }]} />
                <Text style={[styles.labelText, { color: label.color }]} numberOfLines={1}>
                  {label.name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {!read && !showThreadBadge ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

export const MailMessageRow = React.memo(MailMessageRowComponent);

function createStyles(theme: ThemeTokens) {
  const view = {
    row: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      backgroundColor: theme.colors.background,
    },
    rowPressed: {
      backgroundColor: theme.colors.muted,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.secondary,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    content: {
      flex: 1,
      gap: 2,
    },
    topLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["2"],
    },
    meta: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      flexShrink: 0,
    },
    threadBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.muted,
    },
    threadBadgeUnread: {
      backgroundColor: theme.colors.primaryBase + "1f",
    },
    subjectLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
    },
    lockIcon: {
      marginRight: 2,
    },
    flagIcon: {
      marginLeft: 2,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase,
      marginTop: 6,
    },
    labelRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 4,
      marginTop: 2,
    },
    labelChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
    },
    labelDot: {
      width: 6,
      height: 6,
      borderRadius: theme.borderRadius.full,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    avatarText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.secondaryForeground,
    },
    sender: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    date: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    threadBadgeText: {
      fontSize: theme.typography.fontSize.xs.size - 2,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    threadBadgeTextUnread: {
      color: theme.colors.primaryBase,
    },
    subject: {
      flexShrink: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    preview: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    unreadText: {
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    labelText: {
      fontSize: theme.typography.fontSize.xs.size - 1,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
