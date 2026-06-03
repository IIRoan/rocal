import React, { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { LabelDef } from "../../lib/mail/types";
import { LABEL_COLOR_OPTIONS } from "../../lib/mail/use-labels";
import { useTheme } from "../../providers/ThemeProvider";
import { SheetNavButton } from "../sheet";
import { MailSheetList } from "./MailSheetList";
import {
  MAIL_ICON,
  mailColors,
  mailSpacing,
  mailTypography,
} from "./mail-ui";

interface MailLabelsSheetProps {
  labels: LabelDef[];
  messageKeywords: Record<string, boolean> | undefined;
  onToggleLabel: (labelId: string, assigned: boolean) => void;
  onCreateLabel: (name: string, color: string) => void;
  onDeleteLabel: (labelId: string) => void;
  onBack: () => void;
}

export function MailLabelsSheet({
  labels,
  messageKeywords,
  onToggleLabel,
  onCreateLabel,
  onDeleteLabel,
  onBack,
}: MailLabelsSheetProps) {
  const { theme } = useTheme();
  const { styles, dividerInset } = useMemo(() => createStyles(theme), [theme]);
  const type = mailTypography(theme);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");

  const handleCreate = () => {
    const name = newLabelName.trim();
    if (!name) return;
    onCreateLabel(name, newLabelColor);
    setNewLabelName("");
  };

  return (
    <>
      <SheetNavButton label="Actions" onPress={onBack} />

      <MailSheetList>
        {labels.map((label, index) => {
          const isAssigned = messageKeywords?.[`label:${label.id}`] === true;
          return (
            <View key={label.id}>
              {index > 0 ? <View style={[styles.divider, { marginLeft: dividerInset }]} /> : null}
              <Pressable
                onPress={() => onToggleLabel(label.id, !isAssigned)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`${isAssigned ? "Remove" : "Add"} label ${label.name}`}
              >
                <View style={[styles.labelDot, { backgroundColor: label.color }]} />
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {label.name}
                </Text>
                {isAssigned ? (
                  <Feather
                    name="check"
                    size={MAIL_ICON.sheetAccessory}
                    color={theme.colors.primaryBase}
                  />
                ) : null}
              </Pressable>
            </View>
          );
        })}

        {labels.length > 0 ? (
          <View style={[styles.divider, { marginLeft: dividerInset }]} />
        ) : null}

        <Pressable
          onPress={handleCreate}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="Create new label"
        >
          <Feather name="plus" size={MAIL_ICON.sheet} color={theme.colors.mutedForeground} />
          <View style={styles.createField}>
            <TextInput
              value={newLabelName}
              onChangeText={setNewLabelName}
              placeholder="Label name"
              placeholderTextColor={theme.colors.mutedForeground}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <View style={styles.colorRow}>
              {LABEL_COLOR_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setNewLabelColor(opt.value)}
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: opt.value,
                      borderColor:
                        newLabelColor === opt.value
                          ? theme.colors.foreground
                          : "transparent",
                      borderWidth: newLabelColor === opt.value ? 2 : 0,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                />
              ))}
            </View>
          </View>
        </Pressable>
      </MailSheetList>

      {labels.length > 0 ? (
        <View style={styles.manageSection}>
          <Text style={type.overline}>Manage labels</Text>
          <View style={styles.manageChips}>
            {labels.map((label) => (
              <Pressable
                key={label.id}
                onPress={() => onDeleteLabel(label.id)}
                style={({ pressed }) => [styles.manageChip, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Delete label ${label.name}`}
              >
                <View style={[styles.labelDot, { backgroundColor: label.color }]} />
                <Text style={type.caption} numberOfLines={1}>
                  {label.name}
                </Text>
                <Feather
                  name="x"
                  size={MAIL_ICON.rowMeta}
                  color={theme.colors.mutedForeground}
                />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const colors = mailColors(theme);
  const iconCol = MAIL_ICON.sheet;
  const dividerInset = pad.rowH + iconCol + pad.rowGap;

  const sheetStyles = StyleSheet.create({
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
    createField: {
      flex: 1,
      gap: pad.section,
    } as ViewStyle,
    input: {
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
      paddingVertical: pad.tight,
      paddingHorizontal: pad.section,
      borderRadius: theme.borderRadius.md,
      backgroundColor: colors.surface,
    } as TextStyle,
    colorRow: {
      flexDirection: "row",
      gap: pad.section,
    } as ViewStyle,
    colorSwatch: {
      width: 22,
      height: 22,
      borderRadius: 11,
    } as ViewStyle,
    manageSection: {
      paddingTop: pad.rowGap,
      gap: pad.section,
    } as ViewStyle,
    manageChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: pad.section,
    } as ViewStyle,
    manageChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: pad.tight,
      paddingHorizontal: pad.section,
      paddingVertical: pad.tight,
      borderRadius: theme.borderRadius.full,
      backgroundColor: colors.surfaceMuted,
    } as ViewStyle,
  });

  return { styles: sheetStyles, dividerInset };
}
