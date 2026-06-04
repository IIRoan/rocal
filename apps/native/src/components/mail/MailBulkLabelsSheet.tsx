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
import type { ThemeTokens } from "@workspace/design-tokens";
import type { LabelDef } from "../../lib/mail/types";
import { useTheme } from "../../providers/ThemeProvider";
import { SheetNavButton } from "../sheet";
import { MailSheetList } from "./MailSheetList";
import { MAIL_ICON, mailColors, mailSpacing } from "./mail-ui";

interface MailBulkLabelsSheetProps {
  labels: LabelDef[];
  onBack: () => void;
  onApplyLabel: (labelId: string) => void;
}

export function MailBulkLabelsSheet({
  labels,
  onBack,
  onApplyLabel,
}: MailBulkLabelsSheetProps) {
  const { theme } = useTheme();
  const { styles, dividerInset } = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      <SheetNavButton label="More actions" onPress={onBack} />
      <MailSheetList>
        {labels.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No labels yet. Create labels in settings.</Text>
          </View>
        ) : (
          labels.map((label, index) => (
            <View key={label.id}>
              {index > 0 ? (
                <View style={[styles.divider, { marginLeft: dividerInset }]} />
              ) : null}
              <Pressable
                onPress={() => onApplyLabel(label.id)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Apply label ${label.name}`}
              >
                <View style={[styles.labelDot, { backgroundColor: label.color }]} />
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {label.name}
                </Text>
                <Feather
                  name="plus"
                  size={MAIL_ICON.sheetAccessory}
                  color={theme.colors.mutedForeground}
                />
              </Pressable>
            </View>
          ))
        )}
      </MailSheetList>
    </>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const colors = mailColors(theme);
  const iconCol = MAIL_ICON.sheet;
  const dividerInset = pad.rowH + iconCol + pad.rowGap;

  return {
    styles: StyleSheet.create({
      divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.borderSubtle,
      } as ViewStyle,
      row: {
        flexDirection: "row",
        alignItems: "center",
        gap: pad.rowGap,
        paddingHorizontal: pad.rowH,
        paddingVertical: pad.rowV,
        minHeight: 44,
      } as ViewStyle,
      rowPressed: {
        opacity: 0.6,
      } as ViewStyle,
      rowLabel: {
        flex: 1,
        fontSize: theme.typography.fontSize.base.size,
        color: theme.colors.foreground,
      } as TextStyle,
      labelDot: {
        width: 8,
        height: 8,
        borderRadius: theme.borderRadius.full,
      } as ViewStyle,
      empty: {
        paddingHorizontal: pad.rowH,
        paddingVertical: pad.rowV,
      } as ViewStyle,
      emptyText: {
        fontSize: theme.typography.fontSize.sm.size,
        color: theme.colors.mutedForeground,
        textAlign: "center",
      } as TextStyle,
    }),
    dividerInset,
  };
}
