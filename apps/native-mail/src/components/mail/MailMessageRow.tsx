import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather, FontAwesome } from "@expo/vector-icons";
import type { ListDensity, TimeFormat } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  formatAddress,
  formatMessageDate,
  formatThreadSenders,
  isMessageFlagged,
  isMessageRead,
} from "../../lib/mail/mail-helpers";
import {
  ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER,
  listPreviewSnippet,
  messageNeedsDecryptedPreview,
} from "../../lib/mail/mail-preview";
import { getAllMessageLabels } from "../../lib/mail/use-labels";
import { memoizeStyles } from "../../lib/memoize-styles";
import type {
  JmapEmailMessage,
  JmapIdentity,
  LabelDef,
} from "../../lib/mail/types";
import {
  MAIL_ICON,
  MAIL_LAYOUT,
  mailSpacing,
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";
import { MAIL_SELECT_CHECK_SPRING } from "./mail-selection-anim-utils";
import { MailIdentityBadge } from "./MailIdentityBadge";
import { MailLabelChip } from "./MailLabelChip";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";

const EMPTY_LABELS: LabelDef[] = [];
const EMPTY_IDENTITIES: JmapIdentity[] = [];
const MAX_VISIBLE_LABELS = 2;
const PREVIEW_LINE_HEIGHT = 19;

type MailRowStyles = ReturnType<typeof createStyles>;

function pulseSelect(entering: boolean) {
  void Haptics.impactAsync(
    entering
      ? Haptics.ImpactFeedbackStyle.Medium
      : Haptics.ImpactFeedbackStyle.Light,
  );
}

interface MailMessageRowProps {
  message: JmapEmailMessage;
  threadMessages?: JmapEmailMessage[];
  threadCount?: number;
  threadUnreadCount?: number;
  hasAttachments?: boolean;
  showRecipient?: boolean;
  labels?: LabelDef[];
  identities?: JmapIdentity[];
  preview?: string;
  selectionActive?: boolean;
  selected?: boolean;
  timeFormat: TimeFormat;
  timezone?: string;
  density?: ListDensity;
  showLabelChips?: boolean;
  threadExpandable?: boolean;
  onPress: (message: JmapEmailMessage) => void;
  onLongPress?: (message: JmapEmailMessage) => void;
  onToggleSelect?: (message: JmapEmailMessage) => void;
}

function getRowIdentity({
  message,
  threadCount,
  threadUnreadCount,
  threadMessages,
  showRecipient,
}: {
  message: JmapEmailMessage;
  threadCount: number;
  threadUnreadCount: number;
  threadMessages?: JmapEmailMessage[];
  showRecipient: boolean;
}) {
  const read =
    threadCount > 1 ? threadUnreadCount === 0 : isMessageRead(message);
  const threadSenders =
    threadCount > 1 && threadMessages?.length
      ? formatThreadSenders(threadMessages)
      : null;
  const addresses = showRecipient ? message.to : message.from;
  return { read, addresses, name: threadSenders ?? formatAddress(addresses) };
}

function useThreadExpansion({
  threadExpandable,
  threadCount,
  threadMessages,
  message,
}: {
  threadExpandable: boolean;
  threadCount: number;
  threadMessages?: JmapEmailMessage[];
  message: JmapEmailMessage;
}) {
  const [threadExpanded, setThreadExpanded] = useState(false);
  const canExpandThread =
    threadExpandable && threadCount > 1 && (threadMessages?.length ?? 0) > 1;
  const earlierMessages =
    canExpandThread && threadExpanded && threadMessages
      ? threadMessages.filter((entry) => entry.id !== message.id)
      : null;
  const toggleThreadExpanded = useCallback(() => {
    setThreadExpanded((prev) => !prev);
  }, []);
  return {
    threadExpanded,
    canExpandThread,
    earlierMessages,
    toggleThreadExpanded,
  };
}

function useMailRowSelection({
  message,
  selected,
  selectionActive,
  onPress,
  onLongPress,
  onToggleSelect,
}: {
  message: JmapEmailMessage;
  selected: boolean;
  selectionActive: boolean;
  onPress: (message: JmapEmailMessage) => void;
  onLongPress?: (message: JmapEmailMessage) => void;
  onToggleSelect?: (message: JmapEmailMessage) => void;
}) {
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withSpring(
      selected ? 1 : 0,
      MAIL_SELECT_CHECK_SPRING,
    );
  }, [selected, selectedProgress]);

  const checkFillStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
  }));

  const applyToggle = () => {
    pulseSelect(!selectionActive || !selected);
    onToggleSelect?.(message);
  };

  const handleRowPress = () => {
    if (selectionActive) {
      applyToggle();
      return;
    }
    onPress(message);
  };

  const handleLongPress =
    onLongPress || onToggleSelect ? applyToggle : undefined;

  return { checkFillStyle, applyToggle, handleRowPress, handleLongPress };
}

function MailMessageRowComponent({
  message,
  threadMessages,
  threadCount = 1,
  threadUnreadCount = 0,
  hasAttachments = false,
  showRecipient = false,
  labels = EMPTY_LABELS,
  identities = EMPTY_IDENTITIES,
  preview: previewOverride,
  selectionActive = false,
  selected = false,
  timeFormat,
  timezone,
  density = "compact",
  showLabelChips = true,
  threadExpandable = false,
  onPress,
  onLongPress,
  onToggleSelect,
}: MailMessageRowProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = getStyles(theme, skin);
  const comfortable = density === "comfortable";

  const { read, addresses, name } = getRowIdentity({
    message,
    threadCount,
    threadUnreadCount,
    threadMessages,
    showRecipient,
  });
  const flagged = isMessageFlagged(message);
  const messageLabels = getAllMessageLabels(message, labels);
  const subject = message.subject?.trim() || "(no subject)";
  const {
    threadExpanded,
    canExpandThread,
    earlierMessages,
    toggleThreadExpanded,
  } = useThreadExpansion({
    threadExpandable,
    threadCount,
    threadMessages,
    message,
  });
  const { checkFillStyle, applyToggle, handleRowPress, handleLongPress } =
    useMailRowSelection({
      message,
      selected,
      selectionActive,
      onPress,
      onLongPress,
      onToggleSelect,
    });

  return (
    <Pressable
      onPress={handleRowPress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        comfortable && styles.rowComfortable,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole={selectionActive ? "checkbox" : "button"}
      accessibilityLabel={`${read ? "" : "Unread, "}${name}: ${subject}`}
      accessibilityState={selectionActive ? { checked: selected } : undefined}
    >
      <Pressable
        onPress={applyToggle}
        hitSlop={6}
        style={styles.avatar}
        accessibilityRole="checkbox"
        accessibilityLabel={
          selected ? "Deselect conversation" : "Select conversation"
        }
        accessibilityState={{ checked: selected }}
      >
        <BlobatarAvatar
          email={addresses?.[0]?.email}
          name={addresses?.[0]?.name}
          size={MAIL_LAYOUT.rowAvatarSize}
          borderRadius={theme.borderRadius.md}
        />
        <Animated.View
          style={[styles.checkFill, checkFillStyle]}
          pointerEvents="none"
        >
          <Feather name="check" size={16} color={skin.ctaForeground} />
        </Animated.View>
      </Pressable>

      <View style={styles.content}>
        <MailRowTopLine
          name={name}
          read={read}
          message={message}
          identities={identities}
          threadCount={threadCount}
          threadExpanded={threadExpanded}
          canExpandThread={canExpandThread}
          onToggleThreadExpanded={toggleThreadExpanded}
          flagged={flagged}
          hasAttachments={hasAttachments}
          timeFormat={timeFormat}
          timezone={timezone}
          styles={styles}
        />

        <Text
          style={[styles.subject, !read && styles.subjectUnread]}
          numberOfLines={1}
        >
          {subject}
        </Text>

        <MailRowPreview
          message={message}
          override={previewOverride}
          comfortable={comfortable}
          styles={styles}
        />

        <MailRowLabels
          messageLabels={messageLabels}
          showLabelChips={showLabelChips}
          styles={styles}
        />

        {earlierMessages ? (
          <MailRowThreadList
            messages={earlierMessages}
            showRecipient={showRecipient}
            selectionActive={selectionActive}
            timeFormat={timeFormat}
            timezone={timezone}
            onPress={onPress}
            styles={styles}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function MailRowTopLine({
  name,
  read,
  message,
  identities,
  threadCount,
  threadExpanded,
  canExpandThread,
  onToggleThreadExpanded,
  flagged,
  hasAttachments,
  timeFormat,
  timezone,
  styles,
}: {
  name: string;
  read: boolean;
  message: JmapEmailMessage;
  identities: JmapIdentity[];
  threadCount: number;
  threadExpanded: boolean;
  canExpandThread: boolean;
  onToggleThreadExpanded: () => void;
  flagged: boolean;
  hasAttachments: boolean;
  timeFormat: TimeFormat;
  timezone?: string;
  styles: MailRowStyles;
}) {
  const skin = useMailSkin();
  return (
    <View style={styles.topLine}>
      <View style={styles.senderLine}>
        <Text
          style={[styles.sender, !read && styles.senderUnread]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {canExpandThread ? (
          <Pressable
            onPress={onToggleThreadExpanded}
            hitSlop={10}
            style={({ pressed }) => [
              styles.threadToggle,
              pressed && styles.threadTogglePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              threadExpanded
                ? "Collapse conversation"
                : `Show ${threadCount} messages`
            }
            accessibilityState={{ expanded: threadExpanded }}
          >
            <Text style={styles.threadCount}>{threadCount}</Text>
            <Feather
              name={threadExpanded ? "chevron-up" : "chevron-down"}
              size={MAIL_ICON.rowMeta}
              color={skin.textTertiary}
            />
          </Pressable>
        ) : threadCount > 1 ? (
          <Text style={styles.threadCount}>{threadCount}</Text>
        ) : null}
        {!read ? <View style={styles.unreadDot} /> : null}
        <MailIdentityBadge message={message} identities={identities} compact />
      </View>
      <View style={styles.meta}>
        {flagged ? (
          <FontAwesome
            name="star"
            size={MAIL_ICON.rowMeta - 2}
            color={skin.accent}
            accessibilityLabel="Starred"
          />
        ) : null}
        {hasAttachments ? (
          <Feather
            name="paperclip"
            size={MAIL_ICON.rowMeta - 1}
            color={skin.textTertiary}
            accessibilityLabel="Has attachments"
          />
        ) : null}
        <Text style={styles.date}>
          {formatMessageDate(message.receivedAt, { timeFormat, timezone })}
        </Text>
      </View>
    </View>
  );
}

function MailRowPreview({
  message,
  override,
  comfortable,
  styles,
}: {
  message: JmapEmailMessage;
  override?: string;
  comfortable: boolean;
  styles: MailRowStyles;
}) {
  const raw = override?.trim() || listPreviewSnippet(message);
  const preview = raw === ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER ? "" : raw;
  if (preview) {
    return (
      <Text style={styles.preview} numberOfLines={comfortable ? 2 : 1}>
        {preview}
      </Text>
    );
  }
  // Hold the preview line while it decrypts so the row does not grow under the user's scroll.
  if (!messageNeedsDecryptedPreview(message)) return null;
  return (
    <View
      style={[
        styles.previewPlaceholder,
        comfortable && styles.previewPlaceholderComfortable,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function MailRowLabels({
  messageLabels,
  showLabelChips,
  styles,
}: {
  messageLabels: LabelDef[];
  showLabelChips: boolean;
  styles: MailRowStyles;
}) {
  const visibleLabels = showLabelChips
    ? messageLabels.slice(0, MAX_VISIBLE_LABELS)
    : EMPTY_LABELS;
  const extraLabelCount = showLabelChips
    ? messageLabels.length - visibleLabels.length
    : 0;
  if (visibleLabels.length === 0) {
    return null;
  }
  return (
    <View style={styles.labels}>
      {visibleLabels.map((label) => (
        <MailLabelChip key={label.id} name={label.name} color={label.color} />
      ))}
      {extraLabelCount > 0 ? (
        <Text style={styles.labelOverflow}>+{extraLabelCount}</Text>
      ) : null}
    </View>
  );
}

function MailRowThreadList({
  messages,
  showRecipient,
  selectionActive,
  timeFormat,
  timezone,
  onPress,
  styles,
}: {
  messages: JmapEmailMessage[];
  showRecipient: boolean;
  selectionActive: boolean;
  timeFormat: TimeFormat;
  timezone?: string;
  onPress: (message: JmapEmailMessage) => void;
  styles: MailRowStyles;
}) {
  return (
    <View style={styles.threadList}>
      {messages.map((entry) => {
        const entryRead = isMessageRead(entry);
        const entryName = formatAddress(showRecipient ? entry.to : entry.from);
        return (
          <Pressable
            key={entry.id}
            onPress={() => onPress(entry)}
            disabled={selectionActive}
            style={({ pressed }) => [
              styles.threadItem,
              pressed && styles.threadItemPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${entryRead ? "" : "Unread, "}${entryName}`}
          >
            {!entryRead ? <View style={styles.unreadDot} /> : null}
            <Text
              style={[
                styles.threadItemSender,
                !entryRead && styles.senderUnread,
              ]}
              numberOfLines={1}
            >
              {entryName}
            </Text>
            <Text style={styles.date}>
              {formatMessageDate(entry.receivedAt, {
                timeFormat,
                timezone,
              })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const MailMessageRow = React.memo(MailMessageRowComponent);

const getStyles = memoizeStyles(createStyles);

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const pad = mailSpacing(theme);

  const view = {
    row: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      paddingHorizontal: pad.rowH,
      paddingVertical: pad.rowV,
      backgroundColor: theme.colors.background,
    },
    rowComfortable: {
      paddingVertical: pad.rowV + theme.spacing["1"],
    },
    rowSelected: {
      backgroundColor: skin.selected,
    },
    threadToggle: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
      minHeight: 24,
      paddingHorizontal: pad.tight,
      borderRadius: theme.borderRadius.sm,
    },
    threadTogglePressed: {
      backgroundColor: skin.pressed,
    },
    threadList: {
      marginTop: pad.tight + 2,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: skin.borderPrimary,
    },
    threadItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight + 2,
      minHeight: 36,
      paddingLeft: pad.rowGap,
    },
    threadItemPressed: {
      backgroundColor: skin.pressed,
    },
    rowPressed: {
      backgroundColor: skin.pressed,
    },
    avatar: {
      width: MAIL_LAYOUT.rowAvatarSize,
      height: MAIL_LAYOUT.rowAvatarSize,
      marginTop: 2,
      marginRight: pad.rowGap,
      borderRadius: theme.borderRadius.md,
      overflow: "hidden" as const,
    },
    unreadDot: {
      width: MAIL_LAYOUT.unreadDotSize,
      height: MAIL_LAYOUT.unreadDotSize,
      borderRadius: theme.borderRadius.full,
      backgroundColor: skin.unreadDot,
    },
    checkFill: {
      ...StyleSheet.absoluteFill,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: skin.cta,
    },
    content: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    topLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: pad.chipGap,
    },
    senderLine: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight + 2,
      minWidth: 0,
    },
    meta: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight + 2,
      flexShrink: 0,
    },
    previewPlaceholder: {
      height: PREVIEW_LINE_HEIGHT,
    },
    previewPlaceholderComfortable: {
      height: PREVIEW_LINE_HEIGHT * 2,
    },
    labels: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight + 2,
      marginTop: pad.tight + 2,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    sender: {
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "400" as TextStyle["fontWeight"],
      color: skin.textTertiary,
    },
    senderUnread: {
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    threadCount: {
      ...skin.meta,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    date: {
      ...skin.meta,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    subject: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "400" as TextStyle["fontWeight"],
      color: skin.textSecondary,
    },
    subjectUnread: {
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    threadItemSender: {
      flex: 1,
      fontSize: 14,
      lineHeight: 19,
      color: skin.textSecondary,
    },
    preview: {
      fontSize: 14,
      lineHeight: PREVIEW_LINE_HEIGHT,
      color: skin.textTertiary,
    },
    labelOverflow: {
      ...skin.meta,
      fontSize: 12,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
