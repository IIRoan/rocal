import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getErrorMessage,
  partitionCalendarsByKind,
  type Calendar,
} from "@workspace/calendar-core";
import { SettingsPage } from "../SettingsPage";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
} from "../../sheet/SheetSections";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { calendarApiService } from "../../../lib/api";
import { QUERY_KEYS } from "../../../lib/query-keys";
import { useToast } from "../../../providers/ToastProvider";
import {
  WEEK_START_OPTIONS,
  WEEKDAY_OPTIONS,
} from "../../../lib/settings-options";
import {
  formatWorkingDaysLabel,
  parseWorkingDays,
  serializeWorkingDays,
} from "../../../lib/settings-working-days";

export function CalendarSettingsContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();
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

  const weekStartDay = settings?.weekStartDay ?? 0;
  const weekStartPending = pendingKeys.has("weekStartDay");

  if (isLoading && !settings) {
    return (
      <SettingsPage title="Calendar">
        <SheetCenteredState loading message="Loading settings…" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Calendar">
      <SheetScroll>
        <SheetSection title="Default calendar">
          {sortedOwnedCalendars.length === 0 ? (
            <SheetMessage text="No calendars yet. Create one first." />
          ) : (
            <SheetGroup>
              {sortedOwnedCalendars.map((calendar) => (
                <SheetItem
                  key={calendar.id}
                  label={calendar.name}
                  checked={calendar.isDefault}
                  pending={pendingDefaultCalendarId === calendar.id}
                  onPress={() => setDefaultCalendarMutation.mutate(calendar.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: calendar.isDefault }}
                />
              ))}
            </SheetGroup>
          )}
        </SheetSection>

        <SheetSection title="Week starts on">
          <SheetGroup>
            {WEEK_START_OPTIONS.map((option) => {
              const selected = weekStartDay === option.value;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={selected}
                  pending={selected && weekStartPending}
                  onPress={() => updateSetting({ weekStartDay: option.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        <SheetSection
          title="Working days"
          footer={formatWorkingDaysLabel(workingDaysSet)}
        >
          <SheetGroup>
            {WEEKDAY_OPTIONS.map((day) => {
              const checked = workingDaysSet.has(day.value);
              return (
                <SheetItem
                  key={day.value}
                  label={day.label}
                  checked={checked}
                  onPress={() => handleToggleWorkingDay(day.value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
