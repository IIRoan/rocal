import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import type {
  RecurrenceFrequency,
  RecurrencePreview,
} from "@workspace/calendar-core";
import { calendarApiService } from "../../lib/api";
import {
  FREQUENCY_OPTIONS,
  WEEKDAYS,
  parseRRule,
  buildRRule,
  type EndCondition,
} from "./recurrence-picker-utils";

// ─── Props ───────────────────────────────────────────────────────────────────

interface RecurrencePickerProps {
  /** Current recurrence rule string (RRULE format) or null for no recurrence */
  value: string | null;
  /** Callback when the recurrence rule changes; null means no recurrence */
  onChange: (rule: string | null) => void;
  /** Event start date (ISO string) for preview generation */
  eventStart: string;
  /** Event end date (ISO string) for preview generation */
  eventEnd: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RecurrencePicker({
  value,
  onChange,
  eventStart,
  eventEnd,
}: RecurrencePickerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initial = useMemo(() => parseRRule(value), [value]);

  const [frequency, setFrequency] = useState<RecurrenceFrequency | "none">(
    initial?.frequency ?? "none",
  );
  const [interval, setInterval] = useState(initial?.interval ?? 1);
  const [byDay, setByDay] = useState<number[]>(initial?.byDay ?? []);
  const [endCondition, setEndCondition] = useState<EndCondition>(
    initial?.endCondition ?? "never",
  );
  const [count, setCount] = useState(initial?.count ?? 10);
  const [until, setUntil] = useState(initial?.until ?? "");
  const [preview, setPreview] = useState<RecurrencePreview | null>(null);

  // Build and emit the RRULE whenever inputs change
  const emitChange = useCallback(
    (
      freq: RecurrenceFrequency | "none",
      intv: number,
      days: number[],
      endCond: EndCondition,
      cnt: number,
      untilVal: string,
    ) => {
      if (freq === "none") {
        onChange(null);
        return;
      }
      const rule = buildRRule({
        frequency: freq,
        interval: intv,
        byDay: days,
        endCondition: endCond,
        count: cnt,
        until: untilVal,
      });
      onChange(rule);
    },
    [onChange],
  );

  // Fetch preview when rule changes
  useEffect(() => {
    if (frequency === "none") {
      setPreview(null);
      return;
    }

    const rule = buildRRule({
      frequency,
      interval,
      byDay,
      endCondition,
      count,
      until,
    });

    let cancelled = false;
    calendarApiService
      .previewRecurrence(eventStart, eventEnd, rule, 30)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [frequency, interval, byDay, endCondition, count, until, eventStart, eventEnd]);

  const handleFrequencyChange = (freq: RecurrenceFrequency | "none") => {
    setFrequency(freq);
    emitChange(freq, interval, byDay, endCondition, count, until);
  };

  const handleIntervalChange = (text: string) => {
    const val = Math.max(1, parseInt(text, 10) || 1);
    setInterval(val);
    emitChange(frequency, val, byDay, endCondition, count, until);
  };

  const handleDayToggle = (day: number) => {
    const next = byDay.includes(day)
      ? byDay.filter((d) => d !== day)
      : [...byDay, day];
    setByDay(next);
    emitChange(frequency, interval, next, endCondition, count, until);
  };

  const handleEndConditionChange = (cond: EndCondition) => {
    setEndCondition(cond);
    emitChange(frequency, interval, byDay, cond, count, until);
  };

  const handleCountChange = (text: string) => {
    const val = Math.max(1, parseInt(text, 10) || 1);
    setCount(val);
    emitChange(frequency, interval, byDay, endCondition, val, until);
  };

  const handleUntilChange = (text: string) => {
    setUntil(text);
    emitChange(frequency, interval, byDay, endCondition, count, text);
  };

  const frequencyLabel = (freq: RecurrenceFrequency): string => {
    switch (freq) {
      case "daily":
        return interval === 1 ? "day" : "days";
      case "weekly":
        return interval === 1 ? "week" : "weeks";
      case "monthly":
        return interval === 1 ? "month" : "months";
      case "yearly":
        return interval === 1 ? "year" : "years";
    }
  };

  return (
    <View style={styles.container}>
      {/* Frequency selector */}
      <Text style={styles.sectionLabel}>Repeat</Text>
      <View style={styles.frequencyRow}>
        {FREQUENCY_OPTIONS.map((opt) => {
          const isActive = frequency === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[
                styles.frequencyChip,
                isActive && styles.frequencyChipActive,
                isActive && { backgroundColor: theme.colors.primaryBase },
              ]}
              onPress={() => handleFrequencyChange(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={`Repeat ${opt.label}`}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.frequencyChipText,
                  isActive && styles.frequencyChipTextActive,
                  isActive && { color: theme.colors.primaryForeground },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {frequency !== "none" && (
        <>
          {/* Interval */}
          <View style={styles.intervalRow}>
            <Text style={styles.intervalLabel}>Every</Text>
            <TextInput
              style={styles.intervalInput}
              value={String(interval)}
              onChangeText={handleIntervalChange}
              keyboardType="number-pad"
              accessibilityLabel="Repeat interval"
            />
            <Text style={styles.intervalLabel}>
              {frequencyLabel(frequency)}
            </Text>
          </View>

          {/* Weekly day selector */}
          {frequency === "weekly" && (
            <View style={styles.dayRow}>
              {WEEKDAYS.map((day) => {
                const isActive = byDay.includes(day.value);
                return (
                  <Pressable
                    key={day.value}
                    style={[
                      styles.dayChip,
                      isActive && styles.dayChipActive,
                      isActive && { backgroundColor: theme.colors.primaryBase },
                    ]}
                    onPress={() => handleDayToggle(day.value)}
                    accessibilityRole="button"
                    accessibilityLabel={`${day.label}${isActive ? ", selected" : ""}`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        isActive && styles.dayChipTextActive,
                        isActive && {
                          color: theme.colors.primaryForeground,
                        },
                      ]}
                    >
                      {day.short}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* End condition */}
          <Text style={styles.sectionLabel}>Ends</Text>
          <View style={styles.endRow}>
            {(["never", "count", "until"] as const).map((cond) => {
              const isActive = endCondition === cond;
              const labels: Record<EndCondition, string> = {
                never: "Never",
                count: "After",
                until: "On date",
              };
              return (
                <Pressable
                  key={cond}
                  style={[
                    styles.endChip,
                    isActive && styles.endChipActive,
                    isActive && { backgroundColor: theme.colors.primaryBase },
                  ]}
                  onPress={() => handleEndConditionChange(cond)}
                  accessibilityRole="button"
                  accessibilityLabel={`End ${labels[cond]}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.endChipText,
                      isActive && styles.endChipTextActive,
                      isActive && {
                        color: theme.colors.primaryForeground,
                      },
                    ]}
                  >
                    {labels[cond]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {endCondition === "count" && (
            <View style={styles.intervalRow}>
              <TextInput
                style={styles.intervalInput}
                value={String(count)}
                onChangeText={handleCountChange}
                keyboardType="number-pad"
                accessibilityLabel="Number of occurrences"
              />
              <Text style={styles.intervalLabel}>occurrences</Text>
            </View>
          )}

          {endCondition === "until" && (
            <View style={styles.intervalRow}>
              <TextInput
                style={styles.untilInput}
                value={until}
                onChangeText={handleUntilChange}
                placeholder="YYYYMMDD"
                placeholderTextColor={theme.colors.mutedForeground}
                accessibilityLabel="End date"
              />
            </View>
          )}

          {/* Occurrence preview */}
          {preview && preview.instances.length > 0 && (
            <View style={styles.previewSection}>
              <Text style={styles.sectionLabel}>Preview</Text>
              {preview.description ? (
                <Text style={styles.previewDescription}>
                  {preview.description}
                </Text>
              ) : null}
              <View style={styles.previewList}>
                {preview.instances.slice(0, 5).map((instance, idx) => (
                  <Text key={idx} style={styles.previewDate}>
                    {instance.date}
                  </Text>
                ))}
                {preview.totalInstances > 5 && (
                  <Text style={styles.previewMore}>
                    +{preview.totalInstances - 5} more
                  </Text>
                )}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      gap: theme.spacing["3"],
    },
    frequencyRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: theme.spacing["2"],
    },
    frequencyChip: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    frequencyChipActive: {
      borderColor: "transparent",
    },
    intervalRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    intervalInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
      minWidth: 48,
      textAlign: "center" as const,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.card,
    },
    untilInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
      color: theme.colors.foreground,
      backgroundColor: theme.colors.card,
    },
    dayRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["1"],
    },
    dayChip: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    dayChipActive: {
      borderColor: "transparent",
    },
    endRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["2"],
    },
    endChip: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    endChipActive: {
      borderColor: "transparent",
    },
    previewSection: {
      gap: theme.spacing["1"],
    },
    previewList: {
      gap: 2,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    sectionLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    frequencyChipText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    frequencyChipTextActive: {
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    intervalLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    dayChipText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.foreground,
    },
    dayChipTextActive: {
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    endChipText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    endChipTextActive: {
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    previewDescription: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    previewDate: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.foreground,
    },
    previewMore: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      fontStyle: "italic" as const,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export { parseRRule, buildRRule, FREQUENCY_OPTIONS, WEEKDAYS } from "./recurrence-picker-utils";
export type { RecurrencePickerProps };
export type { ParsedRule, EndCondition } from "./recurrence-picker-utils";
