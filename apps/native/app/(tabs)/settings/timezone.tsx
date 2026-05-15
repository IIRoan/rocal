import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  UserSettings,
  UpdateSettingsRequest,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";

// ─── Timezone Data ───────────────────────────────────────────────────────────

interface TimezoneEntry {
  value: string;
  label: string;
}

const TIMEZONE_GROUPS: Record<string, TimezoneEntry[]> = {
  Popular: [
    { value: "UTC", label: "UTC (Coordinated Universal Time)" },
    { value: "America/New_York", label: "Eastern Time (New York)" },
    { value: "America/Chicago", label: "Central Time (Chicago)" },
    { value: "America/Denver", label: "Mountain Time (Denver)" },
    { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
    { value: "Europe/London", label: "London" },
    { value: "Asia/Tokyo", label: "Tokyo" },
  ],
  Americas: [
    { value: "America/Anchorage", label: "Anchorage" },
    { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
    { value: "America/Bogota", label: "Bogotá" },
    { value: "America/Caracas", label: "Caracas" },
    { value: "America/Guatemala", label: "Guatemala City" },
    { value: "America/Havana", label: "Havana" },
    { value: "America/Lima", label: "Lima" },
    { value: "America/Mexico_City", label: "Mexico City" },
    { value: "America/Montevideo", label: "Montevideo" },
    { value: "America/Santiago", label: "Santiago" },
    { value: "America/Sao_Paulo", label: "São Paulo" },
    { value: "America/Toronto", label: "Toronto" },
    { value: "America/Vancouver", label: "Vancouver" },
  ],
  "Europe & Africa": [
    { value: "Europe/Amsterdam", label: "Amsterdam" },
    { value: "Europe/Berlin", label: "Berlin" },
    { value: "Europe/Brussels", label: "Brussels" },
    { value: "Europe/Dublin", label: "Dublin" },
    { value: "Europe/Helsinki", label: "Helsinki" },
    { value: "Europe/Istanbul", label: "Istanbul" },
    { value: "Europe/Madrid", label: "Madrid" },
    { value: "Europe/Moscow", label: "Moscow" },
    { value: "Europe/Paris", label: "Paris" },
    { value: "Europe/Rome", label: "Rome" },
    { value: "Europe/Stockholm", label: "Stockholm" },
    { value: "Europe/Vienna", label: "Vienna" },
    { value: "Europe/Zurich", label: "Zurich" },
    { value: "Africa/Cairo", label: "Cairo" },
    { value: "Africa/Johannesburg", label: "Johannesburg" },
    { value: "Africa/Lagos", label: "Lagos" },
  ],
  "Asia & Pacific": [
    { value: "Asia/Bangkok", label: "Bangkok" },
    { value: "Asia/Beijing", label: "Beijing" },
    { value: "Asia/Calcutta", label: "Mumbai" },
    { value: "Asia/Dubai", label: "Dubai" },
    { value: "Asia/Hong_Kong", label: "Hong Kong" },
    { value: "Asia/Jakarta", label: "Jakarta" },
    { value: "Asia/Karachi", label: "Karachi" },
    { value: "Asia/Seoul", label: "Seoul" },
    { value: "Asia/Shanghai", label: "Shanghai" },
    { value: "Asia/Singapore", label: "Singapore" },
    { value: "Asia/Taipei", label: "Taipei" },
    { value: "Asia/Tehran", label: "Tehran" },
    { value: "Australia/Adelaide", label: "Adelaide" },
    { value: "Australia/Brisbane", label: "Brisbane" },
    { value: "Australia/Melbourne", label: "Melbourne" },
    { value: "Australia/Perth", label: "Perth" },
    { value: "Australia/Sydney", label: "Sydney" },
    { value: "Pacific/Auckland", label: "Auckland" },
    { value: "Pacific/Fiji", label: "Fiji" },
    { value: "Pacific/Honolulu", label: "Honolulu" },
  ],
};

const ALL_TIMEZONES = Object.values(TIMEZONE_GROUPS).flat();

const SECTION_DATA = Object.entries(TIMEZONE_GROUPS).map(([title, data]) => ({
  title,
  data,
}));

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimezoneScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");

  // ─── Data ──────────────────────────────────────────────────────────────────

  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const currentTimezone =
    settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  // ─── Mutation ──────────────────────────────────────────────────────────────

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
      return { previous };
    },
    onError: (_err, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.settings(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (timezone: string) => {
      updateSettingsMutation.mutate({ timezone });
      router.back();
    },
    [updateSettingsMutation, router],
  );

  // ─── Search filtering ─────────────────────────────────────────────────────

  const filteredTimezones = useMemo(() => {
    if (!search.trim()) return null; // null = show grouped list
    const q = search.toLowerCase();
    return ALL_TIMEZONES.filter(
      (tz) =>
        tz.label.toLowerCase().includes(q) ||
        tz.value.toLowerCase().includes(q),
    );
  }, [search]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather
            name="arrow-left"
            size={16}
            color={theme.colors.mutedForeground}
          />
        </Pressable>
        <Text style={styles.headerTitle}>Timezone</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={theme.colors.mutedForeground} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search timezones…"
          placeholderTextColor={theme.colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Results */}
      {filteredTimezones !== null ? (
        // Flat search results
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {filteredTimezones.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather
                name="search"
                size={32}
                color={theme.colors.mutedForeground}
                style={{ opacity: 0.2 }}
              />
              <Text style={styles.emptyText}>No timezones found</Text>
            </View>
          ) : (
            filteredTimezones.map((tz) => (
              <TimezoneRow
                key={tz.value}
                tz={tz}
                isSelected={currentTimezone === tz.value}
                onPress={() => handleSelect(tz.value)}
                theme={theme}
              />
            ))
          )}
        </ScrollView>
      ) : (
        // Grouped section list
        <SectionList
          sections={SECTION_DATA}
          keyExtractor={(item) => item.value}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TimezoneRow
              tz={item}
              isSelected={currentTimezone === item.value}
              onPress={() => handleSelect(item.value)}
              theme={theme}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TimezoneRow({
  tz,
  isSelected,
  onPress,
  theme,
}: {
  tz: TimezoneEntry;
  isSelected: boolean;
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
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${tz.label} (${tz.value})`}
    >
      <Feather name="globe" size={16} color={theme.colors.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
          numberOfLines={1}
        >
          {tz.label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
          numberOfLines={1}
        >
          {tz.value}
        </Text>
      </View>
      {isSelected && (
        <Feather name="check" size={16} color={theme.colors.primaryBase} />
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
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["4"],
      height: 48,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    backButton: {
      padding: theme.spacing["1"],
      borderRadius: theme.borderRadius.md,
    },
    searchRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    searchInput: {
      flex: 1,
      height: 44,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    } as ViewStyle & TextStyle,
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: theme.spacing["8"],
    },
    sectionHeader: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      paddingBottom: theme.spacing["1"],
    },
    emptyState: {
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: theme.spacing["10"],
      gap: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    sectionHeaderText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
