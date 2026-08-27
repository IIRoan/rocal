import React, { useEffect, useMemo, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
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
import type { JmapEmailMessage, JmapIdentity, LabelDef } from "../../lib/mail/types";
import {
  MAIL_ICON,
  MAIL_LAYOUT,
  mailColors,
  mailRadii,
  mailSpacing,
} from "./mail-ui";
import { MAIL_SELECT_CHECK_SPRING } from "./mail-selection-anim-utils";
import { MailIdentityBadge } from "./MailIdentityBadge";
import { BlobatarAvatar } from "../BlobatarAvatar";

const EMPTY_LABELS: LabelDef[] = [];
const EMPTY_IDENTITIES: JmapIdentity[] = [];

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
  const styles = useMemo(() => createStyles(theme), [theme]);
  const radii = useMemo(() => mailRadii(theme), [theme]);
  const colors = useMemo(() => mailColors(theme), [theme]);

  const read =
    threadCount > 1 ? threadUnreadCount === 0 : isMessageRead(message);
  const flagged = isMessageFlagged(message);
  const showThreadBadge = threadCount > 1;
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
  const visibleLabels = messageLabels.slice(0, 2);
  const extraLabelCount = messageLabels.length - visibleLabels.length;
  const skipRowPressRef = useRef(false);

  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withSpring(
      selected ? 1 : 0,
      MAIL_SELECT_CHECK_SPRING,
    );
  }, [selected, selectedProgress]);

  const avatarFaceStyle = useAnimatedStyle(() => {
    const progress = selectedProgress.value;
    return {
      opacity: progress < 0.5 ? 1 : 0,
      transform: [
        {
          scaleX: interpolate(
            progress,
            [0, 0.5],
            [1, 0.02],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const checkFaceStyle = useAnimatedStyle(() => {
    const progress = selectedProgress.value;
    return {
      opacity: progress > 0.5 ? 1 : 0,
      transform: [
        {
          scaleX: interpolate(
            progress,
            [0.5, 1],
            [0.02, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const applyToggle = () => {
    pulseSelect(!selectionActive || !selected);
    onToggleSelect?.(message);
  };

  const handleAvatarPress = () => {
    skipRowPressRef.current = true;
    applyToggle();
    setTimeout(() => {
      skipRowPressRef.current = false;
    }, 80);
  };

  const handleRowPress = () => {
    if (skipRowPressRef.current) {
      skipRowPressRef.current = false;
      return;
    }
    if (selectionActive) {
      applyToggle();
      return;
    }
    onPress(message);
  };

  const handleRowLongPress = () => {
    if (skipRowPressRef.current) {
      skipRowPressRef.current = false;
      return;
    }
    applyToggle();
  };

  return (
    <Pressable
      onPress={handleRowPress}
      onLongPress={
        onLongPress || onToggleSelect ? handleRowLongPress : undefined
      }
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && !selected && styles.rowPressed,
        pressed && selected && styles.rowSelectedPressed,
      ]}
      accessibilityRole={selectionActive ? "checkbox" : "button"}
      accessibilityLabel={`${name}: ${subject}`}
      accessibilityState={{ selected: selectionActive ? selected : undefined }}
    >
      <View style={styles.rowInner}>
        <Pressable
          onPress={handleAvatarPress}
          onLongPress={handleAvatarPress}
          delayLongPress={350}
          hitSlop={6}
          style={styles.avatarHit}
          accessibilityRole="checkbox"
          accessibilityLabel={selected ? "Deselect conversation" : "Select conversation"}
          accessibilityState={{ checked: selected }}
        >
          {!read && !selected ? <View style={styles.unreadDot} /> : null}
          <View
            style={[
              styles.avatarWrap,
              { borderRadius: radii.avatar, overflow: "hidden" },
            ]}
          >
            <Animated.View
              style={[styles.avatarFace, avatarFaceStyle]}
              pointerEvents="none"
            >
              <BlobatarAvatar
                email={addresses?.[0]?.email}
                name={addresses?.[0]?.name}
                size={MAIL_LAYOUT.avatarSize}
                borderRadius={radii.avatar}
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.checkFace,
                { backgroundColor: colors.selectIndicatorOn },
                checkFaceStyle,
              ]}
              pointerEvents="none"
            >
              <Feather
                name="check"
                size={MAIL_ICON.rowSelect}
                color={theme.colors.primaryForeground}
              />
            </Animated.View>
          </View>
        </Pressable>

        <View style={styles.content}>
          <View style={styles.topLine}>
            <View style={styles.senderLine}>
              <Text
                style={[
                  styles.sender,
                  read ? styles.senderRead : styles.senderUnread,
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
              {showThreadBadge ? (
                <Text
                  style={[
                    styles.threadCount,
                    threadUnreadCount > 0 && styles.threadCountUnread,
                  ]}
                >
                  {threadUnreadCount > 0 && threadUnreadCount < threadCount
                    ? `(${threadUnreadCount}/${threadCount})`
                    : `(${threadCount})`}
                </Text>
              ) : null}
              <MailIdentityBadge
                message={message}
                identities={identities}
                compact
              />
            </View>
            <View style={styles.meta}>
              {hasAttachments ? (
                <Feather
                  name="paperclip"
                  size={MAIL_ICON.rowMeta}
                  color={theme.colors.mutedForeground}
                  accessibilityLabel="Has attachments"
                />
              ) : null}
              <Text style={[styles.date, !read && styles.dateUnread]}>
                {formatMessageDate(message.receivedAt)}
              </Text>
              {flagged ? (
                <FontAwesome
                  name="star"
                  size={MAIL_ICON.rowMeta}
                  color="#fbbf24"
                />
              ) : null}
            </View>
          </View>

          <Text
            style={[
              styles.subject,
              read ? styles.subjectRead : styles.subjectUnread,
            ]}
            numberOfLines={1}
          >
            {subject}
          </Text>

          {preview || visibleLabels.length > 0 ? (
            <View style={styles.snippetLine}>
              {visibleLabels.map((label) => (
                <View
                  key={label.id}
                  style={[
                    styles.labelChip,
                    {
                      borderColor: `${label.color}40`,
                      backgroundColor: `${label.color}18`,
                    },
                  ]}
                >
                  <View
                    style={[styles.labelDot, { backgroundColor: label.color }]}
                  />
                  <Text
                    style={[styles.labelText, { color: label.color }]}
                    numberOfLines={1}
                  >
                    {label.name}
                  </Text>
                </View>
              ))}
              {extraLabelCount > 0 ? (
                <Text style={styles.labelOverflow}>+{extraLabelCount}</Text>
              ) : null}
              {preview ? (
                <Text style={styles.preview} numberOfLines={1}>
                  {preview}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const MailMessageRow = React.memo(MailMessageRowComponent);

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const colors = mailColors(theme);

  const view = {
    row: {
      paddingHorizontal: pad.rowH,
      paddingVertical: pad.rowV,
      backgroundColor: theme.colors.background,
    },
    rowInner: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: pad.rowGap,
    },
    rowSelected: {
      backgroundColor: colors.selectedRow,
    },
    rowPressed: {
      backgroundColor: colors.pressed,
    },
    rowSelectedPressed: {
      backgroundColor: theme.colors.primaryBase + "22",
    },
    avatarHit: {
      width: MAIL_LAYOUT.avatarSize,
      height: MAIL_LAYOUT.avatarSize,
    },
    unreadDot: {
      position: "absolute" as const,
      left: -5,
      top: (MAIL_LAYOUT.avatarSize - MAIL_LAYOUT.unreadDotSize) / 2,
      width: MAIL_LAYOUT.unreadDotSize,
      height: MAIL_LAYOUT.unreadDotSize,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase,
      zIndex: 2,
    },
    avatarWrap: {
      width: MAIL_LAYOUT.avatarSize,
      height: MAIL_LAYOUT.avatarSize,
    },
    avatarFace: {
      ...StyleSheet.absoluteFill,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    checkFace: {
      ...StyleSheet.absoluteFill,
      alignItems: "center" as const,
      justifyContent: "center" as const,
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
      gap: pad.tight,
      minWidth: 0,
    },
    meta: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
      flexShrink: 0,
    },
    snippetLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
    },
    labelChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      maxWidth: 88,
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: theme.borderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    labelDot: {
      width: 5,
      height: 5,
      borderRadius: theme.borderRadius.full,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    sender: {
      flexShrink: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    senderUnread: {
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    senderRead: {
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    threadCount: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    threadCountUnread: {
      color: theme.colors.primaryBase,
    },
    date: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    dateUnread: {
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    subject: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: 18,
    },
    subjectUnread: {
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    subjectRead: {
      fontWeight: theme.typography.fontWeight.normal as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    preview: {
      flex: 1,
      minWidth: 0,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    labelText: {
      flexShrink: 1,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    labelOverflow: {
      fontSize: 11,
      lineHeight: 14,
      color: theme.colors.mutedForeground,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
