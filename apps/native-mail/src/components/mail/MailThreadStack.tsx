import type { ReactNode } from "react";
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
import { planMailThreadStack, type TimeFormat } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import {
  MAIL_LAYOUT,
  mailColors,
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";
import { formatAddress, formatMessageDate } from "../../lib/mail/mail-helpers";
import { listPreviewSnippet } from "../../lib/mail/mail-preview";
import type { JmapEmailMessage } from "../../lib/mail/types";

const ROW_AVATAR_SIZE = 28;

type MailThreadStackProps = {
  messages: JmapEmailMessage[];
  activeMessageId: string;
  accountEmail?: string | null;
  previews?: Record<string, string>;
  loading: boolean;
  /** Shows every message instead of folding long runs around the open one. */
  showAll: boolean;
  onShowAll: () => void;
  onSelectMessage: (messageId: string) => void;
  /** The open message, rendered in its place in the thread. */
  children: ReactNode;
};

export function MailThreadStack({
  messages,
  activeMessageId,
  accountEmail,
  previews,
  loading,
  showAll,
  onShowAll,
  onSelectMessage,
  children,
}: MailThreadStackProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const entries = planMailThreadStack(messages, activeMessageId, showAll);

  return (
    <View>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={theme.colors.mutedForeground}
          style={styles.loading}
        />
      ) : null}
      {entries.map((entry, index) => {
        const separated = index > 0 && styles.separated;
        if (entry.kind === "folded") {
          return (
            <Pressable
              key={`folded-${entry.firstHiddenId}`}
              onPress={onShowAll}
              style={({ pressed }) => [
                styles.row,
                separated,
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Show ${entry.count} more messages`}
            >
              <View style={styles.foldBadge}>
                <Feather
                  name="more-horizontal"
                  size={14}
                  color={skin.textSecondary}
                />
              </View>
              <Text style={styles.foldLabel}>
                {entry.count} more messages
              </Text>
            </Pressable>
          );
        }
        if (entry.expanded) {
          return (
            <View
              key={entry.message.id}
              testID="mail-expanded-message"
              style={[
                styles.expanded,
                separated,
                index > 0 && styles.expandedAfterRow,
                index < entries.length - 1 && styles.expandedBeforeRow,
              ]}
            >
              {children}
            </View>
          );
        }
        return (
          <CollapsedMessageRow
            key={entry.message.id}
            testID={`mail-thread-message-${index}`}
            message={entry.message}
            accountEmail={accountEmail}
            preview={previews?.[entry.message.id]}
            timeFormat={timeFormat}
            timezone={timezone}
            separated={index > 0}
            styles={styles}
            onSelect={onSelectMessage}
          />
        );
      })}
    </View>
  );
}

function CollapsedMessageRow({
  testID,
  message,
  accountEmail,
  preview,
  timeFormat,
  timezone,
  separated,
  styles,
  onSelect,
}: {
  testID: string;
  message: JmapEmailMessage;
  accountEmail?: string | null;
  preview?: string;
  timeFormat: TimeFormat;
  timezone?: string;
  separated: boolean;
  styles: ThreadStackStyles;
  onSelect: (messageId: string) => void;
}) {
  const { theme } = useTheme();
  const sender = formatAddress(message.from);
  const snippet = (preview ?? listPreviewSnippet(message)) || "(No body)";
  const isUnread =
    message.keywords?.["$seen"] !== true &&
    !(
      accountEmail &&
      message.from?.[0]?.email?.toLowerCase() === accountEmail.toLowerCase()
    );

  return (
    <Pressable
      testID={testID}
      onPress={() => onSelect(message.id)}
      style={({ pressed }) => [
        styles.row,
        separated && styles.separated,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open message from ${sender}${isUnread ? ", unread" : ""}`}
    >
      <BlobatarAvatar
        email={message.from?.[0]?.email}
        name={message.from?.[0]?.name}
        size={ROW_AVATAR_SIZE}
        borderRadius={theme.borderRadius.md}
      />
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          {isUnread ? <View style={styles.unreadDot} /> : null}
          <Text
            style={[styles.sender, isUnread && styles.senderUnread]}
            numberOfLines={1}
          >
            {sender}
          </Text>
          <Text style={styles.date}>
            {formatMessageDate(message.receivedAt, { timeFormat, timezone })}
          </Text>
        </View>
        <Text style={styles.snippet} numberOfLines={1}>
          {snippet}
        </Text>
      </View>
    </Pressable>
  );
}

type ThreadStackStyles = ReturnType<typeof createStyles>;

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    loading: {
      paddingVertical: theme.spacing["2"],
    },
    separated: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: mailColors(theme).border,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: MAIL_LAYOUT.hitSize + theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    rowPressed: {
      backgroundColor: skin.pressed,
    },
    rowContent: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTop: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    unreadDot: {
      width: MAIL_LAYOUT.unreadDotSize,
      height: MAIL_LAYOUT.unreadDotSize,
      borderRadius: MAIL_LAYOUT.unreadDotSize / 2,
      backgroundColor: skin.unreadDot,
    },
    foldBadge: {
      width: ROW_AVATAR_SIZE,
      height: ROW_AVATAR_SIZE,
      borderRadius: ROW_AVATAR_SIZE / 2,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: skin.borderPrimary,
    },
    expanded: {
      gap: theme.spacing["4"],
    },
    expandedAfterRow: {
      paddingTop: theme.spacing["4"],
    },
    expandedBeforeRow: {
      paddingBottom: theme.spacing["4"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    sender: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    senderUnread: {
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    date: {
      ...skin.meta,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    snippet: {
      ...skin.meta,
      color: skin.textSecondary,
    },
    foldLabel: {
      ...skin.meta,
      color: skin.textSecondary,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
