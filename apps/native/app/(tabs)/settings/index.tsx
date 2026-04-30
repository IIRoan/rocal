import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CalendarView,
  UserSettings,
  UpdateSettingsRequest,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  useTheme,
  type ThemePreference,
} from "../../../src/providers/ThemeProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";

// ─── Constants ───────────────────────────────────────────────────────────────

const THEME_OPTIONS: { label: string; value: ThemePreference }[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

const VIEW_OPTIONS: { label: string; value: CalendarView }[] = [
  { label: "Month", value: "month" },
  { label: "Week", value: "week" },
  { label: "Day", value: "day" },
  { label: "3-Day", value: "3day" },
  { label: "Agenda", value: "agenda" },
];

const WEEK_START_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
];

const TIME_FORMAT_OPTIONS: { label: string; value: "12h" | "24h" }[] = [
  { label: "12-hour", value: "12h" },
  { label: "24-hour", value: "24h" },
];

const DURATION_OPTIONS: { label: string; value: number }[] = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
];

const REMINDER_OPTIONS: { label: string; value: number }[] = [
  { label: "None", value: 0 },
  { label: "5 min before", value: 5 },
  { label: "10 min before", value: 10 },
  { label: "15 min before", value: 15 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
];

const WORKING_HOUR_OPTIONS: { label: string; value: number }[] = Array.from(
  { length: 24 },
  (_, i) => ({
    label: `${i === 0 ? "12" : i > 12 ? String(i - 12) : String(i)}:00 ${i < 12 ? "AM" : "PM"}`,
    value: i,
  }),
);

const WEEKDAY_OPTIONS: { label: string; value: number }[] = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a comma-separated working days string (e.g. "1,2,3,4,5") into a Set. */
function parseWorkingDays(workingDays: string): Set<number> {
  if (!workingDays) return new Set([1, 2, 3, 4, 5]);
  return new Set(
    workingDays
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
  );
}

/** Serialize a Set of day numbers back to a comma-separated string. */
function serializeWorkingDays(days: Set<number>): string {
  return Array.from(days).sort((a, b) => a - b).join(",");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { theme, themePreference, setThemePreference } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes for offline access
  });

  // ─── Optimistic update mutation ────────────────────────────────────────────

  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const updateSettingsMutation = useMutation({
    mutationFn: (update: UpdateSettingsRequest) =>
      calendarApiService.updateUserSettings(update),
    onMutate: async (update) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.settings() });

      // Snapshot previous value
      const previous = queryClient.getQueryData<UserSettings>(
        QUERY_KEYS.settings(),
      );

      // Optimistically update the cache
      if (previous) {
        queryClient.setQueryData<UserSettings>(QUERY_KEYS.settings(), {
          ...previous,
          ...update,
        });
      }

      // Track which keys are being updated
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        return next;
      });

      return { previous };
    },
    onError: (_err, _update, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.settings(), context.previous);
      }
    },
    onSettled: (_data, _error, update) => {
      // Clear pending state
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
      // Refetch to ensure server state is in sync
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
    },
  });

  // ─── Setting update helper ────────────────────────────────────────────────

  const updateSetting = useCallback(
    (update: UpdateSettingsRequest) => {
      updateSettingsMutation.mutate(update);
    },
    [updateSettingsMutation],
  );

  // ─── Theme handler (updates both ThemeProvider and backend) ────────────────

  const handleThemeChange = useCallback(
    (pref: ThemePreference) => {
      setThemePreference(pref);
      updateSetting({ theme: pref });
    },
    [setThemePreference, updateSetting],
  );

  // ─── Working days handler ──────────────────────────────────────────────────

  const workingDaysSet = useMemo(
    () => parseWorkingDays(settings?.workingDays ?? "1,2,3,4,5"),
    [settings?.workingDays],
  );

  const handleToggleWorkingDay = useCallback(
    (day: number) => {
      const next = new Set(workingDaysSet);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      updateSetting({ workingDays: serializeWorkingDays(next) });
    },
    [workingDaysSet, updateSetting],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </SafeAreaView>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (isError) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load settings";
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Settings
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Display Preferences ──────────────────────────────────────── */}
        <SectionHeader title="Display Preferences" styles={styles} />

        <OptionRow
          label="Theme"
          styles={styles}
          isPending={pendingKeys.has("theme")}
        >
          <SegmentedControl
            options={THEME_OPTIONS}
            value={themePreference}
            onValueChange={handleThemeChange}
            theme={theme}
          />
        </OptionRow>

        <OptionRow
          label="Default View"
          styles={styles}
          isPending={pendingKeys.has("defaultView")}
        >
          <SegmentedControl
            options={VIEW_OPTIONS}
            value={settings?.defaultView ?? "month"}
            onValueChange={(v) => updateSetting({ defaultView: v })}
            theme={theme}
          />
        </OptionRow>

        <ToggleRow
          label="Compact View"
          value={settings?.compactView ?? false}
          onValueChange={(v) => updateSetting({ compactView: v })}
          isPending={pendingKeys.has("compactView")}
          theme={theme}
          styles={styles}
        />

        <ToggleRow
          label="Show Week Numbers"
          value={settings?.showWeekNumbers ?? false}
          onValueChange={(v) => updateSetting({ showWeekNumbers: v })}
          isPending={pendingKeys.has("showWeekNumbers")}
          theme={theme}
          styles={styles}
        />

        <ToggleRow
          label="Show Declined Events"
          value={settings?.showDeclinedEvents ?? false}
          onValueChange={(v) => updateSetting({ showDeclinedEvents: v })}
          isPending={pendingKeys.has("showDeclinedEvents")}
          theme={theme}
          styles={styles}
        />

        {/* ── Time & Timezone ──────────────────────────────────────────── */}
        <SectionHeader title="Time & Timezone" styles={styles} />

        <OptionRow
          label="Time Format"
          styles={styles}
          isPending={pendingKeys.has("timeFormat")}
        >
          <SegmentedControl
            options={TIME_FORMAT_OPTIONS}
            value={settings?.timeFormat ?? "12h"}
            onValueChange={(v) => updateSetting({ timeFormat: v })}
            theme={theme}
          />
        </OptionRow>

        <OptionRow
          label="Week Starts On"
          styles={styles}
          isPending={pendingKeys.has("weekStartDay")}
        >
          <SegmentedControl
            options={WEEK_START_OPTIONS}
            value={settings?.weekStartDay ?? 0}
            onValueChange={(v) => updateSetting({ weekStartDay: v })}
            theme={theme}
          />
        </OptionRow>

        <OptionRow
          label="Timezone"
          styles={styles}
          isPending={pendingKeys.has("timezone")}
        >
          <Text style={styles.valueText}>
            {settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Text>
        </OptionRow>

        {/* ── Working Hours ────────────────────────────────────────────── */}
        <SectionHeader title="Working Hours" styles={styles} />

        <OptionRow
          label="Start"
          styles={styles}
          isPending={pendingKeys.has("workingHoursStart")}
        >
          <SegmentedControl
            options={WORKING_HOUR_OPTIONS.filter(
              (o) => o.value >= 5 && o.value <= 12,
            )}
            value={settings?.workingHoursStart ?? 9}
            onValueChange={(v) => updateSetting({ workingHoursStart: v })}
            theme={theme}
          />
        </OptionRow>

        <OptionRow
          label="End"
          styles={styles}
          isPending={pendingKeys.has("workingHoursEnd")}
        >
          <SegmentedControl
            options={WORKING_HOUR_OPTIONS.filter(
              (o) => o.value >= 14 && o.value <= 22,
            )}
            value={settings?.workingHoursEnd ?? 17}
            onValueChange={(v) => updateSetting({ workingHoursEnd: v })}
            theme={theme}
          />
        </OptionRow>

        <OptionRow label="Working Days" styles={styles} isPending={false}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_OPTIONS.map((day) => {
              const isActive = workingDaysSet.has(day.value);
              return (
                <Pressable
                  key={day.value}
                  style={[
                    styles.weekdayChip,
                    isActive && {
                      backgroundColor: theme.colors.primaryBase,
                    },
                  ]}
                  onPress={() => handleToggleWorkingDay(day.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.label} ${isActive ? "active" : "inactive"}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.weekdayChipText,
                      isActive && {
                        color: theme.colors.primaryForeground,
                      },
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </OptionRow>

        {/* ── Notification Preferences ─────────────────────────────────── */}
        <SectionHeader title="Notification Preferences" styles={styles} />

        <ToggleRow
          label="Email Notifications"
          value={settings?.emailNotifications ?? true}
          onValueChange={(v) => updateSetting({ emailNotifications: v })}
          isPending={pendingKeys.has("emailNotifications")}
          theme={theme}
          styles={styles}
        />

        <ToggleRow
          label="Browser Notifications"
          value={settings?.browserNotifications ?? true}
          onValueChange={(v) => updateSetting({ browserNotifications: v })}
          isPending={pendingKeys.has("browserNotifications")}
          theme={theme}
          styles={styles}
        />

        <ToggleRow
          label="Reminder Sound"
          value={settings?.reminderSound ?? true}
          onValueChange={(v) => updateSetting({ reminderSound: v })}
          isPending={pendingKeys.has("reminderSound")}
          theme={theme}
          styles={styles}
        />

        {/* ── Default Event Settings ───────────────────────────────────── */}
        <SectionHeader title="Default Event Settings" styles={styles} />

        <OptionRow
          label="Default Duration"
          styles={styles}
          isPending={pendingKeys.has("defaultEventDuration")}
        >
          <SegmentedControl
            options={DURATION_OPTIONS}
            value={settings?.defaultEventDuration ?? 60}
            onValueChange={(v) => updateSetting({ defaultEventDuration: v })}
            theme={theme}
          />
        </OptionRow>

        <OptionRow
          label="Default Reminder"
          styles={styles}
          isPending={pendingKeys.has("reminder")}
        >
          <SegmentedControl
            options={REMINDER_OPTIONS}
            value={0}
            onValueChange={() => {
              /* Reminder is per-event; this is a UI placeholder */
            }}
            theme={theme}
          />
        </OptionRow>

        {/* ── UI Preferences ───────────────────────────────────────────── */}
        <SectionHeader title="UI Preferences" styles={styles} />

        <OptionRow
          label="Event Encryption"
          styles={styles}
          isPending={pendingKeys.has("eventEncryptionMode")}
        >
          <SegmentedControl
            options={[
              { label: "Hybrid", value: "hybrid" as const },
              { label: "Full", value: "full" as const },
            ]}
            value={settings?.eventEncryptionMode ?? "hybrid"}
            onValueChange={(v) => updateSetting({ eventEncryptionMode: v })}
            theme={theme}
          />
        </OptionRow>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({
  title,
  styles,
}: {
  title: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

function OptionRow({
  label,
  children,
  styles,
  isPending,
}: {
  label: string;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
  isPending: boolean;
}) {
  return (
    <View style={styles.optionRow}>
      <View style={styles.optionLabelRow}>
        <Text style={styles.optionLabel}>{label}</Text>
        {isPending ? (
          <ActivityIndicator size="small" style={styles.pendingIndicator} />
        ) : null}
      </View>
      <View style={styles.optionContent}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  isPending,
  theme,
  styles,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  isPending: boolean;
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLabelRow}>
        <Text style={styles.optionLabel}>{label}</Text>
        {isPending ? (
          <ActivityIndicator size="small" style={styles.pendingIndicator} />
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme.colors.muted,
          true: theme.colors.primaryBase,
        }}
        thumbColor={theme.colors.background}
        accessibilityLabel={label}
      />
    </View>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onValueChange,
  theme,
}: {
  options: { label: string; value: T }[];
  value: T;
  onValueChange: (v: T) => void;
  theme: ThemeTokens;
}) {
  const segStyles = useMemo(() => createSegmentedStyles(theme), [theme]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={segStyles.container}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            style={[
              segStyles.segment,
              isSelected && segStyles.segmentSelected,
            ]}
            onPress={() => onValueChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={opt.label}
          >
            <Text
              style={[
                segStyles.segmentText,
                isSelected && segStyles.segmentTextSelected,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      backgroundColor: theme.colors.background,
      padding: theme.spacing["4"],
    },
    header: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: theme.spacing["8"],
    },
    sectionHeader: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["5"],
      paddingBottom: theme.spacing["2"],
    },
    optionRow: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    optionLabelRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginBottom: theme.spacing["2"],
    },
    optionContent: {
      // Content below the label
    },
    toggleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    toggleLabelRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      flex: 1,
    },
    pendingIndicator: {
      marginLeft: theme.spacing["2"],
    },
    weekdayRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["1"],
    },
    weekdayChip: {
      paddingVertical: theme.spacing["1"],
      paddingHorizontal: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.muted,
    },
    bottomSpacer: {
      height: theme.spacing["8"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      fontSize: theme.typography.fontSize["xl"].size,
      lineHeight: theme.typography.fontSize["xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    sectionHeaderText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    },
    optionLabel: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    valueText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["2"],
    },
    errorText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
      textAlign: "center" as const,
    },
    weekdayChipText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

function createSegmentedStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flexDirection: "row" as const,
      gap: theme.spacing["1"],
    },
    segment: {
      paddingVertical: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.muted,
    },
    segmentSelected: {
      backgroundColor: theme.colors.primaryBase,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    segmentText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    segmentTextSelected: {
      color: theme.colors.primaryForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

// Exported for testing
export { parseWorkingDays, serializeWorkingDays };
