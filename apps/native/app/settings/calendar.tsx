import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getErrorMessage,
  partitionCalendarsByKind,
  type Calendar,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import {
  SettingsPickerRow,
  SettingsSheetOption,
} from "../../src/components/settings/SettingsRows";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "../../src/components/BottomSheet";
import { LoadingScreen } from "../../src/components/ui/loading";
import { useNativeUserSettings } from "../../src/hooks/use-native-user-settings";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import {
  WEEK_START_OPTIONS,
  WEEKDAY_OPTIONS,
} from "../../src/lib/settings-options";
import {
  formatWorkingDaysLabel,
  parseWorkingDays,
  serializeWorkingDays,
} from "../../src/lib/settings-working-days";

type PickerKey = "defaultCalendar" | "weekStart" | "workingDays";

export default function CalendarSettingsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();
  const [activePicker, setActivePicker] = useState<PickerKey | null>(null);
  const [pendingDefaultCalendarId, setPendingDefaultCalendarId] = useState<
    string | null
  >(null);

  const { data: calendars = [] } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    staleTime: 5 * 60 * 1000,
  });

  const { ownedCalendars } = useMemo(
    () => partitionCalendarsByKind(calendars),
    [calendars],
  );
  const sortedOwnedCalendars = useMemo(
    () =>
      [...ownedCalendars].sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
          return left.isDefault ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      }),
    [ownedCalendars],
  );

  const workingDaysSet = useMemo(
    () => parseWorkingDays(settings?.workingDays ?? "[1,2,3,4,5]"),
    [settings?.workingDays],
  );

  const setDefaultCalendarMutation = useMutation({
    mutationFn: (calendarId: string) =>
      calendarApiService.updateCalendar(calendarId, { isDefault: true }),
    onMutate: async (calendarId) => {
      setPendingDefaultCalendarId(calendarId);
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.calendars() });
      const previous = queryClient.getQueryData<Calendar[]>(
        QUERY_KEYS.calendars(),
      );
      if (previous) {
        queryClient.setQueryData<Calendar[]>(
          QUERY_KEYS.calendars(),
          previous.map((calendar) => ({
            ...calendar,
            isDefault: calendar.id === calendarId,
          })),
        );
      }
      return { previous };
    },
    onError: (error, _calendarId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.calendars(), context.previous);
      }
      toast(
        getErrorMessage(error, "Failed to update default calendar"),
        "error",
      );
    },
    onSettled: () => {
      setPendingDefaultCalendarId(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

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

  const defaultCalendarLabel =
    sortedOwnedCalendars.find((calendar) => calendar.isDefault)?.name ??
    sortedOwnedCalendars[0]?.name ??
    "Not set";
  const weekStartLabel =
    WEEK_START_OPTIONS.find(
      (option) => option.value === (settings?.weekStartDay ?? 0),
    )?.label ?? "Sunday";

  if (isLoading && !settings) {
    return <LoadingScreen theme={theme} message="Loading settings…" />;
  }

  return (
    <AppScreen header={<StackScreenHeader title="Calendar" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionItems}>
          <SettingsPickerRow
            icon="star"
            label="Default Calendar"
            value={defaultCalendarLabel}
            onPress={() => setActivePicker("defaultCalendar")}
            theme={theme}
            isPending={Boolean(pendingDefaultCalendarId)}
          />
          <SettingsPickerRow
            icon="calendar"
            label="Week Starts On"
            value={weekStartLabel}
            onPress={() => setActivePicker("weekStart")}
            theme={theme}
            isPending={pendingKeys.has("weekStartDay")}
          />
          <SettingsPickerRow
            icon="briefcase"
            label="Working Days"
            value={formatWorkingDaysLabel(workingDaysSet)}
            onPress={() => setActivePicker("workingDays")}
            theme={theme}
          />
        </View>
      </ScrollView>

      <BottomSheet
        visible={activePicker !== null}
        onDismiss={() => setActivePicker(null)}
        snapPoints={[0.52]}
      >
        <BottomSheetHeader>
          <BottomSheetTitle>
            {activePicker === "defaultCalendar"
              ? "Default calendar"
              : activePicker === "weekStart"
                ? "Start of week"
                : "Working days"}
          </BottomSheetTitle>
        </BottomSheetHeader>
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingVertical: 8,
            paddingBottom: insets.bottom + 8,
          }}
        >
          {activePicker === "defaultCalendar" ? (
            sortedOwnedCalendars.length === 0 ? (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: theme.spacing["3"],
                }}
              >
                <Text
                  style={{
                    fontSize: theme.typography.fontSize.sm.size,
                    color: theme.colors.mutedForeground,
                  }}
                >
                  No calendars yet. Create one first.
                </Text>
              </View>
            ) : (
              sortedOwnedCalendars.map((calendar) => (
                <SettingsSheetOption
                  key={calendar.id}
                  label={calendar.name}
                  isSelected={calendar.isDefault}
                  onPress={() => {
                    setDefaultCalendarMutation.mutate(calendar.id);
                    setActivePicker(null);
                  }}
                  theme={theme}
                />
              ))
            )
          ) : null}
          {activePicker === "weekStart"
            ? WEEK_START_OPTIONS.map((option) => (
                <SettingsSheetOption
                  key={option.value}
                  label={option.label}
                  isSelected={(settings?.weekStartDay ?? 0) === option.value}
                  onPress={() => {
                    updateSetting({ weekStartDay: option.value });
                    setActivePicker(null);
                  }}
                  theme={theme}
                />
              ))
            : null}
          {activePicker === "workingDays"
            ? WEEKDAY_OPTIONS.map((day) => (
                <SettingsSheetOption
                  key={day.value}
                  label={day.label}
                  isSelected={workingDaysSet.has(day.value)}
                  onPress={() => handleToggleWorkingDay(day.value)}
                  theme={theme}
                  multiSelect
                />
              ))
            : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </AppScreen>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: theme.spacing["8"] },
    sectionItems: { paddingVertical: theme.spacing["1"] },
  } satisfies Record<string, ViewStyle>);
}
