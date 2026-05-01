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
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
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
import { ScreenHeader } from "../../../src/components/ScreenHeader";

// ─── Types ───────────────────────────────────────────────────────────────────

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

// ─── Constants ───────────────────────────────────────────────────────────────

const THEME_OPTIONS: { label: string; value: ThemePreference; icon: FeatherIcon }[] = [
  { label: "Light", value: "light", icon: "sun" },
  { label: "Dark", value: "dark", icon: "moon" },
  { label: "System", value: "system", icon: "monitor" },
];

const VIEW_OPTIONS: { label: string; value: CalendarView; icon: FeatherIcon }[] = [
  { label: "Month View", value: "month", icon: "grid" },
  { label: "Week View", value: "week", icon: "columns" },
  { label: "Day View", value: "day", icon: "square" },
  { label: "3-Day View", value: "3day", icon: "sidebar" },
  { label: "Agenda View", value: "agenda", icon: "list" },
];

const WEEK_START_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
];

const TIME_FORMAT_OPTIONS: { label: string; value: "12h" | "24h" }[] = [
  { label: "12 Hour (1:00 PM)", value: "12h" },
  { label: "24 Hour (13:00)", value: "24h" },
];

const DURATION_OPTIONS: { label: string; value: number }[] = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "45 minutes", value: 45 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
];

const WEEKDAY_OPTIONS: { label: string; value: number }[] = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
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
  const router = useRouter();

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: settings,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000,
  });

  // ─── Optimistic update mutation ────────────────────────────────────────────

  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const updateSettingsMutation = useMutation({
    mutationFn: (update: UpdateSettingsRequest) =>
      calendarApiService.updateUserSettings(update),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.settings() });
      const previous = queryClient.getQueryData<UserSettings>(
        QUERY_KEYS.settings(),
      );
      if (previous) {
        queryClient.setQueryData<UserSettings>(QUERY_KEYS.settings(), {
          ...previous,
          ...update,
        });
      }
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.add(k);
        return next;
      });
      return { previous };
    },
    onError: (_err, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.settings(), context.previous);
      }
    },
    onSettled: (_data, _error, update) => {
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
    },
  });

  const updateSetting = useCallback(
    (update: UpdateSettingsRequest) => {
      updateSettingsMutation.mutate(update);
    },
    [updateSettingsMutation],
  );

  // ─── Theme handler ────────────────────────────────────────────────────────

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
      <ScreenHeader title="Settings" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Theme ────────────────────────────────────────────────────── */}
        <SectionLabel text="Theme" theme={theme} />
        <View style={styles.sectionItems}>
          {THEME_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              isSelected={themePreference === opt.value}
              onPress={() => handleThemeChange(opt.value)}
              isPending={pendingKeys.has("theme")}
              theme={theme}
            />
          ))}
        </View>

        {/* ── Default View ─────────────────────────────────────────────── */}
        <SectionLabel text="Default View" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {VIEW_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              isSelected={(settings?.defaultView ?? "month") === opt.value}
              onPress={() => updateSetting({ defaultView: opt.value })}
              isPending={pendingKeys.has("defaultView")}
              theme={theme}
            />
          ))}
        </View>

        {/* ── Display ──────────────────────────────────────────────────── */}
        <SectionLabel text="Display" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <SettingToggleRow
            icon="hash"
            label="Week Numbers"
            description="Show week numbers in calendar views"
            value={settings?.showWeekNumbers ?? false}
            onValueChange={(v) => updateSetting({ showWeekNumbers: v })}
            isPending={pendingKeys.has("showWeekNumbers")}
            theme={theme}
          />
          <SettingToggleRow
            icon="eye-off"
            label="Declined Events"
            description="Show events you've declined"
            value={settings?.showDeclinedEvents ?? false}
            onValueChange={(v) => updateSetting({ showDeclinedEvents: v })}
            isPending={pendingKeys.has("showDeclinedEvents")}
            theme={theme}
          />
        </View>

        {/* ── Time Format ──────────────────────────────────────────────── */}
        <SectionLabel text="Time Format" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {TIME_FORMAT_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon="clock"
              label={opt.label}
              isSelected={(settings?.timeFormat ?? "12h") === opt.value}
              onPress={() => updateSetting({ timeFormat: opt.value })}
              isPending={pendingKeys.has("timeFormat")}
              theme={theme}
            />
          ))}
        </View>

        {/* ── First Day of Week ────────────────────────────────────────── */}
        <SectionLabel text="First Day of Week" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {WEEK_START_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon="calendar"
              label={opt.label}
              isSelected={(settings?.weekStartDay ?? 0) === opt.value}
              onPress={() => updateSetting({ weekStartDay: opt.value })}
              isPending={pendingKeys.has("weekStartDay")}
              theme={theme}
            />
          ))}
        </View>

        {/* ── Timezone ─────────────────────────────────────────────────── */}
        <SectionLabel text="Timezone" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <NavigationRow
            icon="globe"
            label="Timezone"
            value={settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
            onPress={() => router.push("/(tabs)/settings/timezone")}
            theme={theme}
          />
        </View>

        {/* ── Working Days ─────────────────────────────────────────────── */}
        <SectionLabel text="Working Days" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {WEEKDAY_OPTIONS.map((day) => {
            const isActive = workingDaysSet.has(day.value);
            return (
              <SelectionRow
                key={day.value}
                icon="calendar"
                label={day.label}
                isSelected={isActive}
                onPress={() => handleToggleWorkingDay(day.value)}
                isPending={false}
                theme={theme}
              />
            );
          })}
        </View>

        {/* ── Notifications ────────────────────────────────────────────── */}
        <SectionLabel text="Notifications" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <SettingToggleRow
            icon="mail"
            label="Email Notifications"
            description="Receive event reminders via email"
            value={settings?.emailNotifications ?? true}
            onValueChange={(v) => updateSetting({ emailNotifications: v })}
            isPending={pendingKeys.has("emailNotifications")}
            theme={theme}
          />
        </View>

        {/* ── Default Duration ─────────────────────────────────────────── */}
        <SectionLabel text="Default Event Duration" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {DURATION_OPTIONS.map((opt) => (
            <SelectionRow
              key={opt.value}
              icon="clock"
              label={opt.label}
              isSelected={(settings?.defaultEventDuration ?? 60) === opt.value}
              onPress={() => updateSetting({ defaultEventDuration: opt.value })}
              isPending={pendingKeys.has("defaultEventDuration")}
              theme={theme}
            />
          ))}
        </View>

        {/* ── Security ─────────────────────────────────────────────────── */}
        <SectionLabel text="Security" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <SettingToggleRow
            icon="shield"
            label="Full Event Encryption"
            description="Keep event content ciphertext-only on the server"
            value={(settings?.eventEncryptionMode ?? "hybrid") === "full"}
            onValueChange={(v) =>
              updateSetting({ eventEncryptionMode: v ? "full" : "hybrid" })
            }
            isPending={pendingKeys.has("eventEncryptionMode")}
            theme={theme}
          />
          {settings?.eventEncryptionMode === "full" && (
            <View style={styles.hintRow}>
              <Text style={styles.hintText}>
                Reminder emails will only include timing details when full encryption is active.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Small uppercase section label, matching the web command palette style. */
function SectionLabel({
  text,
  theme,
  isFirst = true,
}: {
  text: string;
  theme: ThemeTokens;
  isFirst?: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing["4"],
        paddingTop: isFirst ? theme.spacing["3"] : theme.spacing["2"],
        paddingBottom: theme.spacing["1"],
        ...(isFirst
          ? {}
          : {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
              marginTop: theme.spacing["2"],
            }),
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
          color: theme.colors.mutedForeground,
        }}
        accessibilityRole="header"
      >
        {text}
      </Text>
    </View>
  );
}

/** A pressable row with icon, label, and a check mark when selected. */
function SelectionRow({
  icon,
  label,
  isSelected,
  onPress,
  isPending,
  theme,
}: {
  icon: FeatherIcon;
  label: string;
  isSelected: boolean;
  onPress: () => void;
  isPending: boolean;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["2"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
    >
      <Feather
        name={icon}
        size={16}
        color={theme.colors.mutedForeground}
      />
      <Text
        style={{
          flex: 1,
          fontSize: theme.typography.fontSize.sm.size,
          lineHeight: theme.typography.fontSize.sm.lineHeight,
          color: theme.colors.foreground,
        }}
      >
        {label}
      </Text>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : isSelected ? (
        <Feather
          name="check"
          size={16}
          color={theme.colors.primaryBase}
        />
      ) : null}
    </Pressable>
  );
}

/** A pressable row that navigates to a sub-page, with icon, label, current value, and chevron. */
function NavigationRow({
  icon,
  label,
  value,
  onPress,
  theme,
}: {
  icon: FeatherIcon;
  label: string;
  value: string;
  onPress: () => void;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["2"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
      <Feather
        name="chevron-right"
        size={14}
        color={theme.colors.mutedForeground}
        style={{ opacity: 0.4 }}
      />
    </Pressable>
  );
}

/** A toggle row with icon, label, description, and a switch. */
function SettingToggleRow({
  icon,
  label,
  description,
  value,
  onValueChange,
  isPending,
  theme,
}: {
  icon: FeatherIcon;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  isPending: boolean;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["2"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Feather
        name={icon}
        size={16}
        color={theme.colors.mutedForeground}
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: theme.colors.input,
            true: theme.colors.primaryBase,
          }}
          thumbColor="#ffffff"
          style={{ transform: [{ scale: 0.85 }] }}
        />
      )}
    </Pressable>
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
    sectionItems: {
      paddingVertical: theme.spacing["1"],
    },
    hintRow: {
      paddingHorizontal: theme.spacing["3"],
      paddingBottom: theme.spacing["2"],
      marginHorizontal: theme.spacing["1"],
      paddingLeft: theme.spacing["3"] + 16 + theme.spacing["3"], // align with text after icon
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
    hintText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

// Exported for testing
export { parseWorkingDays, serializeWorkingDays };
