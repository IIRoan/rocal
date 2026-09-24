import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useUserTimeFormat } from "../../hooks/use-user-time-format";
import { useUserTimezone } from "../../hooks/use-user-timezone";
import { formatAddress, formatMessageDate } from "../../lib/mail/mail-helpers";
import { listPreviewSnippet } from "../../lib/mail/mail-preview";
import type { JmapEmailMessage } from "../../lib/mail/types";
import { BlobatarAvatar } from "../BlobatarAvatar";

const listEntering = FadeIn.duration(180);

interface ConversationThreadStripProps {
  messages: JmapEmailMessage[];
  activeMessageId: string;
  accountEmail?: string | null;
  previews?: Record<string, string>;
  onSelectMessage: (messageId: string) => void;
}

export function ConversationThreadStrip({
  messages,
  activeMessageId,
  accountEmail,
  previews,
  onSelectMessage,
}: ConversationThreadStripProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const [expanded, setExpanded] = useState(false);
  const threadKey = messages[0]?.threadId ?? messages[0]?.id ?? "";

  useEffect(() => {
    setExpanded(false);
  }, [threadKey]);

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
        onPress={() => setExpanded((open) => !open)}
        style={({ pressed }) => [
          styles.header,
          pressed && styles.headerPressed,
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${messages.length} messages in thread`}
      >
        <Feather
          name={expanded ? "chevron-down" : "chevron-right"}
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

      {expanded ? (
        <Animated.ScrollView
          entering={listEntering}
          style={styles.list}
          nestedScrollEnabled
        >
          {messages.map((threadMessage) => {
            const isActive = threadMessage.id === activeMessageId;
            const sender = formatAddress(threadMessage.from);
            const preview =
              (previews?.[threadMessage.id] ??
                listPreviewSnippet(threadMessage)).slice(0, 120) ||
              "(No body)";
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
                {!isRead ? (
                  <View style={styles.unreadDot} />
                ) : (
                  <View style={styles.readSpacer} />
                )}
                <BlobatarAvatar
                  email={threadMessage.from?.[0]?.email}
                  name={threadMessage.from?.[0]?.name}
                  size={20}
                />
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
                  {formatMessageDate(threadMessage.receivedAt, {
                    timeFormat,
                    timezone,
                  })}
                </Text>
              </Pressable>
            );
          })}
        </Animated.ScrollView>
      ) : null}

      {expanded && ownCount > 0 ? (
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
      overflow: "hidden" as const,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["1"],
      paddingVertical: theme.spacing["2"],
      minHeight: 40,
    },
    headerPressed: {
      opacity: 0.85,
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
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
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
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
