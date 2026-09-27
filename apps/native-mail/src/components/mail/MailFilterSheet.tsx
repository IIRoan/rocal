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
import {
  DEFAULT_MAIL_LIST_FILTERS,
  MAIL_LIST_AGES,
  MAIL_LIST_READ_STATES,
  MAIL_SEARCH_TEXT_FIELDS,
  SEARCH_FILTER_FIELDS,
  countActiveMailListFilters,
  countMailSearchFieldValues,
  isValidSearchDate,
  type MailListFilters,
  type MailSearchFieldValues,
  type MailSearchTextField,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { LabelDef } from "../../lib/mail/types";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  BottomSheet,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import { MAIL_ICON, mailSpacing, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import { Switch } from "@workspace/native-core/components/ui/Switch";

interface MailFilterSheetProps {
  visible: boolean;
  filters: MailListFilters;
  onFiltersChange: (filters: MailListFilters) => void;
  labels: LabelDef[];
  resultCount: number;
  searchFields: MailSearchFieldValues;
  onSearchFieldsChange: (fields: MailSearchFieldValues) => void;
  onDismiss: () => void;
}

const SEARCH_FIELD_META = new Map(
  SEARCH_FILTER_FIELDS.map((entry) => [entry.field, entry]),
);

function sameSearchFields(a: MailSearchFieldValues, b: MailSearchFieldValues) {
  return MAIL_SEARCH_TEXT_FIELDS.every(
    (field) => (a[field]?.trim() ?? "") === (b[field]?.trim() ?? ""),
  );
}

/** Combinable message list filters plus server-side field search (sender, recipient, subject, body, dates). */
export function MailFilterSheet({
  visible,
  filters,
  onFiltersChange,
  labels,
  resultCount,
  searchFields,
  onSearchFieldsChange,
  onDismiss,
}: MailFilterSheetProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);
  const [draftFields, setDraftFields] =
    useState<MailSearchFieldValues>(searchFields);
  const draftDirty = !sameSearchFields(draftFields, searchFields);
  const activeCount =
    countActiveMailListFilters(filters) + countMailSearchFieldValues(searchFields);

  const commitAndDismiss = () => {
    if (draftDirty) onSearchFieldsChange(draftFields);
    onDismiss();
  };

  const resetAll = () => {
    setDraftFields({});
    onFiltersChange(DEFAULT_MAIL_LIST_FILTERS);
    if (countMailSearchFieldValues(searchFields) > 0) onSearchFieldsChange({});
  };

  const setDraftField = (field: MailSearchTextField, value: string) =>
    setDraftFields((prev) => ({ ...prev, [field]: value }));

  const patch = (next: Partial<MailListFilters>) =>
    onFiltersChange({ ...filters, ...next });

  const toggleLabel = (labelId: string) =>
    patch({
      labelIds: filters.labelIds.includes(labelId)
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
    });

  return (
    <BottomSheet
      visible={visible}
      onDismiss={commitAndDismiss}
      snapPoints={[0.7, 0.92]}
      initialSnapIndex={0}
    >
      <BottomSheetHeader>
        <View style={styles.headerRow}>
          <BottomSheetTitle>Filter</BottomSheetTitle>
          {activeCount > 0 || draftDirty ? (
            <Pressable
              onPress={resetAll}
              hitSlop={8}
              style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
            >
              <Text style={styles.resetLabel}>Reset</Text>
            </Pressable>
          ) : null}
        </View>
      </BottomSheetHeader>

      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search fields</Text>
          <View style={styles.card}>
            {MAIL_SEARCH_TEXT_FIELDS.map((field, index) => {
              const meta = SEARCH_FIELD_META.get(field);
              const value = draftFields[field] ?? "";
              const isDate = meta?.type === "date";
              const invalid =
                isDate && value.trim().length > 0 && !isValidSearchDate(value);
              return (
                <View
                  key={field}
                  style={[styles.fieldRow, index > 0 && styles.rowDivider]}
                >
                  <Text style={styles.fieldLabel}>{meta?.label ?? field}</Text>
                  <TextInput
                    value={value}
                    onChangeText={(text) => setDraftField(field, text)}
                    onSubmitEditing={commitAndDismiss}
                    placeholder={meta?.placeholder}
                    placeholderTextColor={skin.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType={
                      isDate
                        ? "numbers-and-punctuation"
                        : field === "from" || field === "to"
                          ? "email-address"
                          : "default"
                    }
                    returnKeyType="search"
                    accessibilityLabel={`${meta?.label ?? field} search`}
                    style={[styles.fieldInput, invalid && styles.fieldInputInvalid]}
                  />
                </View>
              );
            })}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.segmentTrack} accessibilityRole="radiogroup">
            {MAIL_LIST_READ_STATES.map((option) => {
              const active = option.value === filters.readState;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => patch({ readState: option.value })}
                  style={({ pressed }) => [
                    styles.segment,
                    active && styles.segmentActive,
                    pressed && !active && styles.pressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Show only</Text>
          <View style={styles.card}>
            <ToggleRow
              styles={styles}
              theme={theme}
              icon="star"
              label="Starred"
              value={filters.starred}
              onChange={(starred) => patch({ starred })}
            />
            <ToggleRow
              styles={styles}
              theme={theme}
              icon="paperclip"
              label="Has attachments"
              value={filters.attachments}
              onChange={(attachments) => patch({ attachments })}
              divider
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Received</Text>
          <View style={styles.card}>
            {MAIL_LIST_AGES.map((option, index) => {
              const active = option.value === filters.age;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => patch({ age: option.value })}
                  style={({ pressed }) => [
                    styles.row,
                    index > 0 && styles.rowDivider,
                    pressed && styles.rowPressed,
                  ]}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={styles.rowLabel}>{option.label}</Text>
                  {active ? (
                    <Feather name="check" size={MAIL_ICON.sheetAccessory} color={skin.accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {labels.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Labels</Text>
            <View style={styles.card}>
              {labels.map((label, index) => {
                const active = filters.labelIds.includes(label.id);
                return (
                  <Pressable
                    key={label.id}
                    onPress={() => toggleLabel(label.id)}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityLabel={label.name}
                    accessibilityState={{ checked: active }}
                  >
                    <View style={styles.iconSlot}>
                      <View style={[styles.labelDot, { backgroundColor: label.color }]} />
                    </View>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {label.name}
                    </Text>
                    {active ? (
                      <Feather name="check" size={MAIL_ICON.sheetAccessory} color={skin.accent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </BottomSheetScrollView>

      <BottomSheetFooter>
        <Pressable
          onPress={commitAndDismiss}
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.doneLabel}>
            {draftDirty
              ? "Search"
              : activeCount === 0
              ? "Done"
              : resultCount === 1
                ? "Show 1 conversation"
                : `Show ${resultCount} conversations`}
          </Text>
        </Pressable>
      </BottomSheetFooter>
    </BottomSheet>
  );
}

function ToggleRow({
  styles,
  theme,
  icon,
  label,
  value,
  onChange,
  divider,
}: {
  styles: ReturnType<typeof createStyles>;
  theme: ThemeTokens;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.row,
        divider && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
    >
      <View style={styles.iconSlot}>
        <Feather name={icon} size={MAIL_ICON.sheet} color={theme.colors.mutedForeground} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.switchSlot}>
        <Switch value={value} />
      </View>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const pad = mailSpacing(theme);

  const view = {
    headerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["2"],
    },
    resetButton: {
      minHeight: 32,
      justifyContent: "center" as const,
      paddingHorizontal: theme.spacing["1"],
    },
    pressed: {
      opacity: 0.6,
    },
    content: {
      paddingHorizontal: pad.sheetH,
      paddingBottom: theme.spacing["4"],
      gap: theme.spacing["5"],
    },
    section: {
      gap: theme.spacing["2"],
    },
    segmentTrack: {
      flexDirection: "row" as const,
      padding: 3,
      gap: 3,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: skin.field,
    },
    segment: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 38,
      borderRadius: theme.borderRadius.md,
    },
    segmentActive: {
      backgroundColor: theme.colors.background,
    },
    card: {
      borderRadius: theme.borderRadius.lg,
      backgroundColor: skin.field,
      overflow: "hidden" as const,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.rowGap,
      minHeight: 48,
      paddingHorizontal: pad.rowH,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: skin.borderPrimary,
    },
    rowPressed: {
      backgroundColor: skin.selected,
    },
    iconSlot: {
      width: MAIL_ICON.sheet,
      alignItems: "center" as const,
    },
    labelDot: {
      width: 8,
      height: 8,
      borderRadius: theme.borderRadius.full,
    },
    fieldRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.rowGap,
      minHeight: 48,
      paddingHorizontal: pad.rowH,
    },
    switchSlot: {
      alignSelf: "stretch" as const,
      justifyContent: "center" as const,
    },
    doneButton: {
      minHeight: 48,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
      backgroundColor: skin.cta,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    resetLabel: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: skin.accent,
    },
    sectionTitle: {
      paddingHorizontal: theme.spacing["1"],
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: skin.textTertiary,
    },
    segmentLabel: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: skin.textSecondary,
    },
    segmentLabelActive: {
      color: theme.colors.foreground,
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    fieldLabel: {
      width: 64,
      fontSize: 15,
      lineHeight: 20,
      color: skin.textSecondary,
    },
    fieldInput: {
      flex: 1,
      minHeight: 44,
      paddingVertical: 0,
      fontSize: 15,
      color: theme.colors.foreground,
    },
    fieldInputInvalid: {
      color: theme.colors.destructive,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: theme.colors.foreground,
    },
    doneLabel: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: skin.ctaForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
