import React, { useMemo } from "react";
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
import { getMailboxIcon } from "../../lib/mail/mail-helpers";
import type { JmapMailbox } from "../../lib/mail/types";
import {
  MAIL_ICON,
  MAIL_LAYOUT,
  mailColors,
  mailSpacing,
  mailTypography,
} from "./mail-ui";

interface MailBulkMoveSheetProps {
  mailboxes: JmapMailbox[];
  bottomInset: number;
  heading?: string;
  disabled?: boolean;
  onSelectMailbox: (mailboxId: string) => void;
}

export function MailBulkMoveSheet({
  mailboxes,
  bottomInset,
  heading = "Move to",
  disabled,
  onSelectMailbox,
}: MailBulkMoveSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const type = mailTypography(theme);

  return (
    <View style={[styles.root, { paddingBottom: bottomInset }]}>
      <Text style={[styles.heading, type.overline]}>{heading}</Text>
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bounces={mailboxes.length > 6}
      >
        {mailboxes.map((mailbox, index) => (
          <View key={mailbox.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              onPress={() => onSelectMailbox(mailbox.id)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
                disabled && styles.rowDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Move to ${mailbox.name}`}
            >
              <Feather
                name={getMailboxIcon(mailbox) as keyof typeof Feather.glyphMap}
                size={MAIL_ICON.sheet}
                color={theme.colors.mutedForeground}
              />
              <Text style={styles.rowLabel} numberOfLines={1}>
                {mailbox.name}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const colors = mailColors(theme);
  const iconCol = MAIL_ICON.sheet;
  const dividerInset = pad.rowH + iconCol + pad.rowGap;

  return StyleSheet.create({
    root: {
      paddingHorizontal: pad.sheetH,
      paddingTop: pad.tight,
    } as ViewStyle,
    heading: {
      paddingHorizontal: pad.tight,
      paddingBottom: pad.section,
    } as TextStyle,
    scroll: {
      maxHeight: 280,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: colors.surfaceMuted,
      overflow: "hidden",
    } as ViewStyle,
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: pad.rowGap,
      paddingHorizontal: pad.rowH,
      paddingVertical: pad.rowV,
      minHeight: MAIL_LAYOUT.hitSize,
    } as ViewStyle,
    rowPressed: {
      backgroundColor: colors.pressedStrong,
    } as ViewStyle,
    rowDisabled: {
      opacity: 0.45,
    } as ViewStyle,
    rowLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    } as TextStyle,
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginLeft: dividerInset,
    } as ViewStyle,
  });
}
