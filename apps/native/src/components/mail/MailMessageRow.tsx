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
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
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
import { extractMessageBodies } from "../../lib/mail/message-security";
import { getAllMessageLabels } from "../../lib/mail/use-labels";
import type { JmapEmailMessage, LabelDef } from "../../lib/mail/types";
import {
  MAIL_ICON,
  MAIL_LAYOUT,
  mailColors,
  mailRadii,
  mailSpacing,
} from "./mail-ui";
import {
  MAIL_SELECT_CHECK_SPRING,
  selectionCheckScale,
  selectionRowOpacity,
  selectionRowShift,
  selectionUnreadDotOpacity,
} from "./mail-selection-anim-utils";
import { useSelectionProgress } from "./mail-selection-anim";

interface MailMessageRowProps {
  message: JmapEmailMessage;
  threadMessages?: JmapEmailMessage[];
  threadCount?: number;
  threadUnreadCount?: number;
  hasAttachments?: boolean;
  showRecipient?: boolean;
  labels?: LabelDef[];
  selectionActive?: boolean;
  selected?: boolean;
  onPress: (message: JmapEmailMessage) => void;
  onLongPress?: (message: JmapEmailMessage) => void;
  onToggleSelect?: (message: JmapEmailMessage) => void;
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
  const preview =
    threadCount > 1
      ? `${threadCount} messages · ${buildPreview(message)}`
      : buildPreview(message);

  const selectionProgress = useSelectionProgress();
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withSpring(
      selected ? 1 : 0,
      MAIL_SELECT_CHECK_SPRING,
    );
  }, [selected, selectedProgress]);

  const rowShiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: selectionRowShift(selectionProgress.value) }],
  }));

  const badgeWrapStyle = useAnimatedStyle(() => ({
    opacity: selectionRowOpacity(selectionProgress.value),
    transform: [{ scale: selectionCheckScale(selectionProgress.value) }],
  }));

  const unreadDotStyle = useAnimatedStyle(() => ({
    opacity: selectionUnreadDotOpacity(selectionProgress.value),
  }));

  const badgeStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        selectedProgress.value,
        [0, 1],
        [theme.colors.background, colors.selectIndicatorOn],
      ),
      borderColor: interpolateColor(
        selectedProgress.value,
        [0, 1],
        [colors.selectIndicator, theme.colors.background],
      ),
      transform: [
        {
          scale: interpolate(selectedProgress.value, [0, 1], [1, 1.06]),
        },
      ],
    }),
    [colors.selectIndicator, colors.selectIndicatorOn, theme.colors.background],
  );

  const checkStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
    transform: [{ scale: selectedProgress.value }],
  }));

  const handleRowPress = () => {
    if (selectionActive) {
      onToggleSelect?.(message);
      return;
    }
    onPress(message);
  };

  const handleRowLongPress = () => {
    if (selectionActive) {
      onToggleSelect?.(message);
      return;
    }
    onLongPress?.(message);
  };

  return (
    <Pressable
      onPress={handleRowPress}
      onLongPress={
        onLongPress || onToggleSelect ? handleRowLongPress : undefined
      }
      delayLongPress={320}
      style={({ pressed }) => [
        styles.row,
        !read && !selected && !selectionActive && styles.rowUnread,
        selected && styles.rowSelected,
        pressed && !selected && styles.rowPressed,
        pressed && selected && styles.rowSelectedPressed,
      ]}
      accessibilityRole={selectionActive ? "checkbox" : "button"}
      accessibilityLabel={`${name}: ${subject}`}
      accessibilityState={{ selected: selectionActive ? selected : undefined }}
    >
      <Animated.View style={[styles.rowInner, rowShiftStyle]}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { borderRadius: radii.avatar }]}>
            <Text style={styles.avatarText}>{getInitials(addresses)}</Text>
          </View>
          <Animated.View
            style={[styles.checkBadgeWrap, badgeWrapStyle]}
            pointerEvents="none"
          >
            <Animated.View
              style={[
                styles.checkBadge,
                { borderRadius: radii.selectBox },
                badgeStyle,
              ]}
            >
              <Animated.View style={checkStyle}>
                <Feather
                  name="check"
                  size={MAIL_ICON.rowMeta}
                  color={theme.colors.primaryForeground}
                />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </View>

        <View style={styles.content}>
          <View style={styles.topLine}>
            <Text
              style={[
                styles.sender,
                read ? styles.readText : styles.unreadText,
              ]}
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
                    size={MAIL_ICON.rowMeta}
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
                  size={MAIL_ICON.rowMeta}
                  color={theme.colors.mutedForeground}
                  accessibilityLabel="Has attachments"
                />
              ) : null}
              <Text style={[styles.date, !read && styles.dateUnread]}>
                {formatMessageDate(message.receivedAt)}
              </Text>
            </View>
          </View>

          <View style={styles.subjectLine}>
            <Text
              style={[
                styles.subject,
                read ? styles.readText : styles.unreadText,
              ]}
              numberOfLines={1}
            >
              {subject}
            </Text>
            {flagged ? (
              <FontAwesome
                name="star"
                size={MAIL_ICON.rowMeta}
                color="#fbbf24"
                style={styles.flagIcon}
              />
            ) : null}
          </View>

          <Text
            style={[
              styles.preview,
              read ? styles.previewRead : styles.previewUnread,
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>

          {messageLabels.length > 0 ? (
            <View style={styles.labelRow}>
              {messageLabels.map((label) => (
                <View
                  key={label.id}
                  style={[
                    styles.labelChip,
                    {
                      borderColor: `${label.color}50`,
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
            </View>
          ) : null}
        </View>

        {!read && !showThreadBadge ? (
          <Animated.View style={[styles.unreadDot, unreadDotStyle]} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

export const MailMessageRow = React.memo(MailMessageRowComponent);

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const colors = mailColors(theme);
  const radii = mailRadii(theme);
  const badgeSize = MAIL_LAYOUT.selectBoxSize;

  const view = {
    row: {
      paddingHorizontal: pad.rowH,
      paddingVertical: pad.rowV,
      backgroundColor: theme.colors.background,
      overflow: "hidden" as const,
    },
    rowInner: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: pad.rowGap,
    },
    rowUnread: {
      backgroundColor: colors.unreadRow,
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
    avatarWrap: {
      width: MAIL_LAYOUT.avatarSize,
      height: MAIL_LAYOUT.avatarSize,
    },
    avatar: {
      width: MAIL_LAYOUT.avatarSize,
      height: MAIL_LAYOUT.avatarSize,
      backgroundColor: theme.colors.secondary,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    checkBadgeWrap: {
      position: "absolute" as const,
      right: -2,
      bottom: -2,
    },
    checkBadge: {
      width: badgeSize,
      height: badgeSize,
      borderWidth: 2,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    content: {
      flex: 1,
      gap: pad.tight,
    },
    topLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: pad.chipGap,
    },
    meta: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
      flexShrink: 0,
    },
    threadBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
      paddingHorizontal: pad.section,
      paddingVertical: pad.tight,
      borderRadius: radii.selectBox,
      backgroundColor: theme.colors.muted,
    },
    threadBadgeUnread: {
      backgroundColor: theme.colors.primaryBase + "1f",
    },
    subjectLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
    },
    flagIcon: {
      marginLeft: pad.tight,
    },
    unreadDot: {
      width: MAIL_LAYOUT.unreadDotSize,
      height: MAIL_LAYOUT.unreadDotSize,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase,
      marginTop: pad.section,
    },
    labelRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: pad.tight,
      marginTop: pad.tight,
    },
    labelChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
      paddingHorizontal: pad.section,
      paddingVertical: pad.tight,
      borderRadius: radii.selectBox,
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
    dateUnread: {
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    threadBadgeText: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
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
    },
    previewRead: {
      color: theme.colors.mutedForeground,
      fontWeight: theme.typography.fontWeight.normal as TextStyle["fontWeight"],
    },
    previewUnread: {
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    readText: {
      fontWeight: theme.typography.fontWeight.normal as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    unreadText: {
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    labelText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
