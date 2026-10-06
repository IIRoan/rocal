import React, { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import {
  SheetButton,
  SheetGroup,
  SheetItem,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "@workspace/native-core/components/sheet/SheetSections";
import {
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";

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

type FilterDisclosureId = "received" | "labels" | "search";

/** One tall stop, so a swipe up scrolls the list instead of resizing the sheet. */
const FILTER_SHEET_SNAP_POINTS = [0.9];

const SEARCH_FIELD_META = new Map(
  SEARCH_FILTER_FIELDS.map((entry) => [entry.field, entry]),
);

function sameSearchFields(a: MailSearchFieldValues, b: MailSearchFieldValues) {
  return MAIL_SEARCH_TEXT_FIELDS.every(
    (field) => (a[field]?.trim() ?? "") === (b[field]?.trim() ?? ""),
  );
}

function doneLabel(
  draftDirty: boolean,
  activeCount: number,
  resultCount: number,
) {
  if (draftDirty) return "Search";
  if (activeCount === 0) return "Done";
  return resultCount === 1
    ? "Show 1 conversation"
    : `Show ${resultCount} conversations`;
}

function labelsSummary(labels: LabelDef[], labelIds: ReadonlySet<string>) {
  const selected = labels.filter((label) => labelIds.has(label.id));
  if (selected.length === 0) return "Any";
  return selected.length === 1
    ? (selected[0]?.name ?? "1 selected")
    : `${selected.length} selected`;
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
  const [expanded, setExpanded] = useState<FilterDisclosureId | null>(null);
  const selectedLabelIds = useMemo(
    () => new Set(filters.labelIds),
    [filters.labelIds],
  );
  const draftDirty = !sameSearchFields(draftFields, searchFields);
  const draftFieldCount = countMailSearchFieldValues(draftFields);
  const activeCount =
    countActiveMailListFilters(filters) +
    countMailSearchFieldValues(searchFields);

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

  const patch = (next: Partial<MailListFilters>) => {
    // Haptics are unavailable on some devices; a dropped tick is harmless.
    void Haptics.selectionAsync().catch(() => undefined);
    onFiltersChange({ ...filters, ...next });
  };

  const toggleLabel = (labelId: string) =>
    patch({
      labelIds: selectedLabelIds.has(labelId)
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
    });

  const toggleDisclosure = (id: FilterDisclosureId) => {
    // Haptics are unavailable on some devices; a dropped tick is harmless.
    void Haptics.selectionAsync().catch(() => undefined);
    setExpanded((current) => (current === id ? null : id));
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={commitAndDismiss}
      snapPoints={FILTER_SHEET_SNAP_POINTS}
    >
      <BottomSheetHeader>
        <View style={styles.headerRow}>
          <BottomSheetTitle>Filter</BottomSheetTitle>
          {activeCount > 0 || draftDirty ? (
            <Pressable
              onPress={resetAll}
              hitSlop={8}
              style={({ pressed }) => [
                styles.resetButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Reset filters"
            >
              <Text style={styles.resetLabel}>Reset</Text>
            </Pressable>
          ) : null}
        </View>
      </BottomSheetHeader>

      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <SheetSection title="Status">
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
                  <Text
                    style={[
                      styles.segmentLabel,
                      active && styles.segmentLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SheetSection>

        <SheetSection title="Show only">
          <SheetGroup>
            <SheetSwitchItem
              icon="star"
              label="Starred"
              value={filters.starred}
              onValueChange={(starred) => patch({ starred })}
            />
            <SheetSwitchItem
              icon="paperclip"
              label="Has attachments"
              value={filters.attachments}
              onValueChange={(attachments) => patch({ attachments })}
            />
          </SheetGroup>
        </SheetSection>

        <SheetSection title="Refine">
          <FilterDisclosure
            icon="clock"
            label="Received"
            value={
              MAIL_LIST_AGES.find((option) => option.value === filters.age)
                ?.label
            }
            expanded={expanded === "received"}
            onToggle={() => toggleDisclosure("received")}
          >
            {MAIL_LIST_AGES.map((option) => {
              const active = option.value === filters.age;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={active}
                  onPress={() => patch({ age: option.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                />
              );
            })}
          </FilterDisclosure>

          {labels.length > 0 ? (
            <FilterDisclosure
              icon="tag"
              label="Labels"
              value={labelsSummary(labels, selectedLabelIds)}
              expanded={expanded === "labels"}
              onToggle={() => toggleDisclosure("labels")}
            >
              {labels.map((label) => {
                const active = selectedLabelIds.has(label.id);
                return (
                  <SheetItem
                    key={label.id}
                    label={label.name}
                    swatch={label.color}
                    checked={active}
                    onPress={() => toggleLabel(label.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                  />
                );
              })}
            </FilterDisclosure>
          ) : null}

          <FilterDisclosure
            icon="search"
            label="Search fields"
            value={draftFieldCount === 0 ? "None" : `${draftFieldCount} set`}
            expanded={expanded === "search"}
            onToggle={() => toggleDisclosure("search")}
          >
            {MAIL_SEARCH_TEXT_FIELDS.map((field) => {
              const meta = SEARCH_FIELD_META.get(field);
              const label = meta?.label ?? field;
              const value = draftFields[field] ?? "";
              const isDate = meta?.type === "date";
              const invalid =
                isDate && value.trim().length > 0 && !isValidSearchDate(value);
              return (
                <View key={field} style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <SheetTextField
                    value={value}
                    onChangeText={(text) => setDraftField(field, text)}
                    onSubmitEditing={commitAndDismiss}
                    placeholder={meta?.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    keyboardType={
                      isDate
                        ? "numbers-and-punctuation"
                        : field === "from" || field === "to"
                          ? "email-address"
                          : "default"
                    }
                    returnKeyType="search"
                    accessibilityLabel={`${label} search`}
                    style={[
                      styles.fieldInput,
                      invalid && styles.fieldInputInvalid,
                    ]}
                  />
                </View>
              );
            })}
          </FilterDisclosure>
        </SheetSection>
      </BottomSheetScrollView>

      <BottomSheetFooter>
        <SheetButton
          label={doneLabel(draftDirty, activeCount, resultCount)}
          onPress={commitAndDismiss}
        />
      </BottomSheetFooter>
    </BottomSheet>
  );
}

/** Collapsed row that shows the current value and reveals its options in the same group when opened. */
function FilterDisclosure({
  icon,
  label,
  value,
  expanded,
  onToggle,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const skin = useMailSkin();
  return (
    <SheetGroup>
      <SheetItem
        icon={icon}
        label={label}
        value={value}
        onPress={onToggle}
        accessibilityState={{ expanded }}
        trailing={
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={skin.textTertiary}
          />
        }
      />
      {expanded ? children : null}
    </SheetGroup>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
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
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      paddingBottom: theme.spacing["4"],
      gap: theme.spacing["6"],
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
    fieldRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: 48,
      paddingHorizontal: theme.spacing["4"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    resetLabel: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: skin.accent,
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
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    fieldInputInvalid: {
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
