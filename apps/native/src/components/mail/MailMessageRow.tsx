import React, { useEffect, useMemo } from "react";
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
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
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
} from "../../lib/mail/mail-preview";
import { getAllMessageLabels } from "../../lib/mail/use-labels";
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
} from "./mail-ui";
import { MAIL_SELECT_CHECK_SPRING } from "./mail-selection-anim-utils";
import { MailIdentityBadge } from "./MailIdentityBadge";
import { MailLabelChip } from "./MailLabelChip";
import { BlobatarAvatar } from "../BlobatarAvatar";

const EMPTY_LABELS: LabelDef[] = [];
const EMPTY_IDENTITIES: JmapIdentity[] = [];
const MAX_VISIBLE_LABELS = 2;

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
  onPress: (message: JmapEmailMessage) => void;
  onLongPress?: (message: JmapEmailMessage) => void;
  onToggleSelect?: (message: JmapEmailMessage) => void;
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
  onPress,
  onLongPress,
  onToggleSelect,
}: MailMessageRowProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);

  const read =
    threadCount > 1 ? threadUnreadCount === 0 : isMessageRead(message);
  const flagged = isMessageFlagged(message);
  const messageLabels = getAllMessageLabels(message, labels);
  const addresses = showRecipient ? message.to : message.from;
  const threadSenders =
    threadCount > 1 && threadMessages?.length
      ? formatThreadSenders(threadMessages)
      : null;
  const name = threadSenders ?? formatAddress(addresses);
  const subject = message.subject?.trim() || "(no subject)";
  const previewRaw = previewOverride?.trim() || listPreviewSnippet(message);
  const preview =
    previewRaw === ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER ? "" : previewRaw;
  const visibleLabels = messageLabels.slice(0, MAX_VISIBLE_LABELS);
  const extraLabelCount = messageLabels.length - visibleLabels.length;

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

  return (
    <Pressable
      onPress={handleRowPress}
      onLongPress={onLongPress || onToggleSelect ? applyToggle : undefined}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
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
        <View style={styles.topLine}>
          <View style={styles.senderLine}>
            <Text
              style={[styles.sender, !read && styles.senderUnread]}
              numberOfLines={1}
            >
              {name}
            </Text>
            {threadCount > 1 ? (
              <Text style={styles.threadCount}>{threadCount}</Text>
            ) : null}
            {!read ? <View style={styles.unreadDot} /> : null}
            <MailIdentityBadge
              message={message}
              identities={identities}
              compact
            />
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
              {formatMessageDate(message.receivedAt)}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.subject, !read && styles.subjectUnread]}
          numberOfLines={1}
        >
          {subject}
        </Text>

        {preview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}

        {visibleLabels.length > 0 ? (
          <View style={styles.labels}>
            {visibleLabels.map((label) => (
              <MailLabelChip
                key={label.id}
                name={label.name}
                color={label.color}
              />
            ))}
            {extraLabelCount > 0 ? (
              <Text style={styles.labelOverflow}>+{extraLabelCount}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const MailMessageRow = React.memo(MailMessageRowComponent);

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
    rowSelected: {
      backgroundColor: skin.selected,
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
    preview: {
      fontSize: 14,
      lineHeight: 19,
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
