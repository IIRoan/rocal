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
import {
  DEFAULT_MAIL_LIST_FILTERS,
  MAIL_LIST_AGES,
  MAIL_LIST_READ_STATES,
  countActiveMailListFilters,
  type MailListFilters,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { LabelDef } from "../../lib/mail/types";
import { useTheme } from "../../providers/ThemeProvider";
import {
  BottomSheet,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "../BottomSheet";
import { MAIL_ICON, mailSpacing, useMailSkin, type MailSkin } from "./mail-ui";
import { Switch } from "../ui/Switch";

interface MailFilterSheetProps {
  visible: boolean;
  filters: MailListFilters;
  onFiltersChange: (filters: MailListFilters) => void;
  labels: LabelDef[];
  resultCount: number;
  onDismiss: () => void;
}

/** Combinable message list filters: status, starred, attachments, received date, and labels. */
export function MailFilterSheet({
  visible,
  filters,
  onFiltersChange,
  labels,
  resultCount,
  onDismiss,
}: MailFilterSheetProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);
  const activeCount = countActiveMailListFilters(filters);

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
      onDismiss={onDismiss}
      snapPoints={[0.7, 0.92]}
      initialSnapIndex={0}
    >
      <BottomSheetHeader>
        <View style={styles.headerRow}>
          <BottomSheetTitle>Filter</BottomSheetTitle>
          {activeCount > 0 ? (
            <Pressable
              onPress={() => onFiltersChange(DEFAULT_MAIL_LIST_FILTERS)}
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

      <BottomSheetScrollView contentContainerStyle={styles.content}>
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
          onPress={onDismiss}
          style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.doneLabel}>
            {activeCount === 0
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
