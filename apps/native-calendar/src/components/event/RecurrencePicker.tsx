import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import type {
  RecurrenceFrequency,
  RecurrenceRule,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  EventEditorChip,
  createEditorFieldStyle,
} from "./EventEditorPrimitives";
import { OptionSheet, type OptionSheetItem } from "./EventPickerSheets";

const WEEKDAYS = [
  { index: 1, short: "M", long: "Monday" },
  { index: 2, short: "T", long: "Tuesday" },
  { index: 3, short: "W", long: "Wednesday" },
  { index: 4, short: "T", long: "Thursday" },
  { index: 5, short: "F", long: "Friday" },
  { index: 6, short: "S", long: "Saturday" },
  { index: 0, short: "S", long: "Sunday" },
];

const UNIT_LABELS: Record<RecurrenceFrequency, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  format(new Date(2024, index, 1), "MMMM"),
);

type OpenSheet = "unit" | "month" | "ends" | null;

function parseBounded(value: string, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, parsed));
}

/** Lets the field sit empty while typing; the rule only ever receives a bounded number. */
function BoundedNumberInput({
  value,
  min,
  max,
  onChange,
  style,
  accessibilityLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  style: StyleProp<TextStyle>;
  accessibilityLabel: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <TextInput
      style={style}
      value={text ?? String(value)}
      onChangeText={(next) => {
        setText(next);
        if (next) onChange(parseBounded(next, min, max));
      }}
      onBlur={() => setText(null)}
      keyboardType="number-pad"
      maxLength={String(max).length}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export function RecurrencePicker({
  rule,
  onChange,
}: {
  rule: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const update = (updates: Partial<RecurrenceRule>) =>
    onChange({ ...rule, ...updates });
  const selectedWeekdays = rule.byWeekDay ?? [];
  const unitIndex = rule.interval === 1 ? 0 : 1;
  const endMode = rule.count ? "after" : rule.until ? "until" : "never";
  const closeSheet = () => setOpenSheet(null);

  const unitItems: OptionSheetItem[] = (
    Object.keys(UNIT_LABELS) as RecurrenceFrequency[]
  ).map((frequency) => ({
    key: frequency,
    label: UNIT_LABELS[frequency][unitIndex],
    selected: rule.frequency === frequency,
    onSelect: () => {
      update({
        frequency,
        byWeekDay: undefined,
        byMonthDay: undefined,
        byMonth: undefined,
      });
      closeSheet();
    },
  }));

  const monthItems: OptionSheetItem[] = MONTHS.map((month, index) => ({
    key: month,
    label: month,
    selected: rule.byMonth?.[0] === index + 1,
    onSelect: () => {
      update({ byMonth: [index + 1] });
      closeSheet();
    },
  }));

  const endItems: OptionSheetItem[] = [
    {
      key: "never",
      label: "Never",
      selected: endMode === "never",
      onSelect: () => {
        update({ count: undefined, until: undefined });
        closeSheet();
      },
    },
    {
      key: "after",
      label: "After",
      selected: endMode === "after",
      onSelect: () => {
        update({ count: rule.count ?? 10, until: undefined });
        closeSheet();
      },
    },
    ...(rule.until
      ? [
          {
            key: "until",
            label: `On ${format(new Date(rule.until), "MMM d, yyyy")}`,
            selected: endMode === "until",
            onSelect: closeSheet,
          },
        ]
      : []),
  ];

  const endLabel =
    endMode === "after"
      ? "After"
      : endMode === "until" && rule.until
        ? `On ${format(new Date(rule.until), "MMM d, yyyy")}`
        : "Never";

  return (
    <View style={styles.container}>
      <View style={styles.line}>
        <Text style={styles.lineLabel}>Every</Text>
        <BoundedNumberInput
          style={[styles.field, styles.numberField]}
          value={rule.interval}
          min={1}
          max={99}
          onChange={(interval) => update({ interval })}
          accessibilityLabel="Repeat interval"
        />
        <EventEditorChip
          label={UNIT_LABELS[rule.frequency][unitIndex]}
          trailingIcon="chevron-down"
          accessibilityLabel={`Repeat unit: ${UNIT_LABELS[rule.frequency][unitIndex]}`}
          onPress={() => setOpenSheet("unit")}
        />
      </View>

      {rule.frequency === "weekly" && (
        <View style={styles.line}>
          <Text style={styles.lineLabel}>On</Text>
          <View style={styles.weekdays}>
            {WEEKDAYS.map((day) => {
              const active = selectedWeekdays.includes(day.index);
              return (
                <Pressable
                  key={day.index}
                  style={[styles.weekday, active && styles.weekdayActive]}
                  hitSlop={4}
                  onPress={() => {
                    const next = active
                      ? selectedWeekdays.filter((value) => value !== day.index)
                      : [...selectedWeekdays, day.index].sort();
                    update({ byWeekDay: next.length > 0 ? next : undefined });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={day.long}
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.weekdayText,
                      active && styles.weekdayTextActive,
                    ]}
                  >
                    {day.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {(rule.frequency === "monthly" || rule.frequency === "yearly") && (
        <View style={styles.line}>
          <Text style={styles.lineLabel}>On</Text>
          {rule.frequency === "yearly" && (
            <EventEditorChip
              label={
                rule.byMonth?.[0] ? (MONTHS[rule.byMonth[0] - 1] ?? "") : "Same month"
              }
              muted={!rule.byMonth?.[0]}
              trailingIcon="chevron-down"
              accessibilityLabel="Month"
              onPress={() => setOpenSheet("month")}
            />
          )}
          <TextInput
            style={[styles.field, styles.numberField]}
            value={rule.byMonthDay?.[0]?.toString() ?? ""}
            onChangeText={(text) =>
              update({
                byMonthDay: text ? [parseBounded(text, 1, 31)] : undefined,
              })
            }
            placeholder="Day"
            placeholderTextColor={theme.colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={2}
            accessibilityLabel="Day of month"
          />
          {rule.frequency === "monthly" && (
            <Text style={styles.suffixLabel}>of the month</Text>
          )}
        </View>
      )}

      <View style={styles.line}>
        <Text style={styles.lineLabel}>Ends</Text>
        <EventEditorChip
          label={endLabel}
          trailingIcon="chevron-down"
          accessibilityLabel={`Ends: ${endLabel}`}
          onPress={() => setOpenSheet("ends")}
        />
        {endMode === "after" && (
          <>
            <BoundedNumberInput
              style={[styles.field, styles.countField]}
              value={rule.count ?? 1}
              min={1}
              max={999}
              onChange={(count) => update({ count })}
              accessibilityLabel="Number of occurrences"
            />
            <Text style={styles.suffixLabel}>
              {rule.count === 1 ? "time" : "times"}
            </Text>
          </>
        )}
      </View>

      <OptionSheet
        visible={openSheet === "unit"}
        onClose={closeSheet}
        title="Repeat every"
        items={unitItems}
        theme={theme}
        bottomInset={insets.bottom}
      />
      <OptionSheet
        visible={openSheet === "month"}
        onClose={closeSheet}
        title="Month"
        items={monthItems}
        theme={theme}
        bottomInset={insets.bottom}
      />
      <OptionSheet
        visible={openSheet === "ends"}
        onClose={closeSheet}
        title="Ends"
        items={endItems}
        theme={theme}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const lineLabel: TextStyle = {
    fontSize: theme.typography.fontSize.sm.size,
    color: theme.colors.mutedForeground,
  };
  return StyleSheet.create({
    container: {
      gap: 6,
      paddingTop: 6,
    },
    line: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
    },
    lineLabel: {
      ...lineLabel,
      minWidth: 48,
    },
    suffixLabel: lineLabel,
    field: createEditorFieldStyle(theme),
    numberField: {
      width: 56,
      paddingHorizontal: theme.spacing["2"],
      textAlign: "center",
    },
    countField: {
      width: 64,
      paddingHorizontal: theme.spacing["2"],
      textAlign: "center",
    },
    weekdays: {
      flexDirection: "row",
      gap: 4,
    },
    weekday: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent + "99",
    },
    weekdayActive: {
      backgroundColor: theme.colors.primaryBase,
    },
    weekdayText: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    weekdayTextActive: {
      color: theme.colors.primaryForeground,
    },
  });
}
