import React, { useMemo } from "react";
import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  DEFAULT_SUB_ADDRESS_DELIMITER,
  resolveMailIdentityBadge,
  shouldShowIdentityNameBadge,
  type MailIdentityRef,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import type { JmapEmailMessage } from "../../lib/mail/types";

type MailIdentityBadgeProps = {
  message: JmapEmailMessage;
  identities: MailIdentityRef[];
  compact?: boolean;
  subAddressDelimiter?: string;
};

export function MailIdentityBadge({
  message,
  identities,
  compact = false,
  subAddressDelimiter = DEFAULT_SUB_ADDRESS_DELIMITER,
}: MailIdentityBadgeProps) {
  const { theme } = useTheme();
  const styles = useMemo(
    () => createStyles(theme, compact),
    [compact, theme],
  );

  const info = resolveMailIdentityBadge(message, identities, {
    subAddressDelimiter,
  });
  if (!info) return null;

  const showIdentityName = shouldShowIdentityNameBadge(info);

  if (info.displayTag) {
    return (
      <View
        style={styles.tagBadge}
        accessibilityLabel={`Sub-address tag ${info.displayTag}`}
      >
        <Feather
          name="tag"
          size={compact ? 10 : 11}
          color={theme.colors.primaryBase}
        />
        <Text style={styles.tagText} numberOfLines={1}>
          {subAddressDelimiter}
          {info.displayTag}
        </Text>
      </View>
    );
  }

  if (showIdentityName && info.matchingIdentity?.name) {
    return (
      <View
        style={styles.nameBadge}
        accessibilityLabel={info.matchingIdentity.name}
      >
        <Feather
          name="mail"
          size={compact ? 10 : 11}
          color={theme.colors.mutedForeground}
        />
        <Text style={styles.nameText} numberOfLines={1}>
          {compact
            ? info.matchingIdentity.name
            : `via ${info.matchingIdentity.name}`}
        </Text>
      </View>
    );
  }

  return null;
}

function createStyles(theme: ThemeTokens, compact: boolean) {
  const view = {
    tagBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      maxWidth: compact ? 100 : undefined,
      paddingHorizontal: compact ? theme.spacing["1.5"] : theme.spacing["2"],
      paddingVertical: compact ? 2 : theme.spacing["0.5"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase + "1a",
    },
    nameBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      maxWidth: compact ? 100 : undefined,
      paddingHorizontal: compact ? theme.spacing["1.5"] : theme.spacing["2"],
      paddingVertical: compact ? 2 : theme.spacing["0.5"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.secondary,
      borderWidth: compact ? 0 : StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    tagText: {
      fontSize: compact
        ? theme.typography.fontSize.xs.size
        : theme.typography.fontSize.sm.size,
      lineHeight: compact
        ? theme.typography.fontSize.xs.lineHeight
        : theme.typography.fontSize.sm.lineHeight,
      fontFamily: theme.typography.fontFamily.mono,
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    nameText: {
      fontSize: compact
        ? theme.typography.fontSize.xs.size
        : theme.typography.fontSize.sm.size,
      lineHeight: compact
        ? theme.typography.fontSize.xs.lineHeight
        : theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
