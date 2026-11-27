import React, { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_REMINDER_MINUTES,
  DEFAULT_REMINDER_SETTING_OPTIONS,
  eventDurationOptions,
  partitionCalendarsByKind,
} from "@workspace/calendar-core";
import { SettingsPage } from "@workspace/native-core/components/settings/SettingsPage";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useNativeUserSettings } from "@workspace/native-core/hooks/use-native-user-settings";
import {
  useSetDefaultCalendar,
  useSettingsCalendars,
} from "../../../hooks/use-calendar-settings";
import {
  WEEK_START_OPTIONS,
  WEEKDAY_OPTIONS,
} from "@workspace/native-core/lib/settings-options";
import {
  formatWorkingDaysLabel,
  parseWorkingDays,
  serializeWorkingDays,
} from "../../../lib/settings-working-days";

export function CalendarSettingsContent() {
  const { settings, isLoading, pendingKeys, updateSetting } =
    useNativeUserSettings();
  const [pendingDefaultCalendarId, setPendingDefaultCalendarId] = useState<
    string | null
  >(null);

  const { data: calendars = [] } = useSettingsCalendars();

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

  const setDefaultCalendarMutation = useSetDefaultCalendar(
    setPendingDefaultCalendarId,
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

  const weekStartDay = settings?.weekStartDay ?? 0;
  const eventDuration = settings?.defaultEventDuration ?? 60;
  const defaultReminder =
    settings?.defaultReminderMinutes ?? DEFAULT_REMINDER_MINUTES;

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

        <RadioSection
          title="Default event duration"
          footer="Used for new events."
          options={eventDurationOptions(eventDuration)}
          value={eventDuration}
          pending={pendingKeys.has("defaultEventDuration")}
          onSelect={(value) => updateSetting({ defaultEventDuration: value })}
        />

        <RadioSection
          title="Default reminder"
          footer="New events start with this reminder."
          options={DEFAULT_REMINDER_SETTING_OPTIONS}
          value={defaultReminder}
          pending={pendingKeys.has("defaultReminderMinutes")}
          onSelect={(value) => updateSetting({ defaultReminderMinutes: value })}
        />

        <RadioSection
          title="Week starts on"
          options={WEEK_START_OPTIONS}
          value={weekStartDay}
          pending={pendingKeys.has("weekStartDay")}
          onSelect={(value) => updateSetting({ weekStartDay: value })}
        />

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

function RadioSection({
  title,
  footer,
  options,
  value,
  pending,
  onSelect,
}: {
  title: string;
  footer?: string;
  options: readonly { value: number; label: string }[];
  value: number;
  pending: boolean;
  onSelect: (value: number) => void;
}) {
  return (
    <SheetSection title={title} footer={footer}>
      <SheetGroup>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <SheetItem
              key={option.value}
              label={option.label}
              checked={selected}
              pending={selected && pending}
              onPress={() => onSelect(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            />
          );
        })}
      </SheetGroup>
    </SheetSection>
  );
}
