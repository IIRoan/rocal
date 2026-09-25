import React, { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  UserSettings,
  UpdateSettingsRequest,
} from "@workspace/calendar-core";
import { SettingsPage, useSettingsBack } from "../SettingsPage";
import {
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSearchField,
  SheetSection,
} from "../../sheet/SheetSections";
import { calendarApiService } from "../../../lib/api";
import { QUERY_KEYS } from "../../../lib/query-keys";

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

export function TimezoneSettingsContent() {
  const goBack = useSettingsBack();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");

  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const currentTimezone =
    settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

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

  const handleSelect = useCallback(
    (timezone: string) => {
      updateSettingsMutation.mutate({ timezone });
      goBack();
    },
    [updateSettingsMutation, goBack],
  );

  const filteredTimezones = useMemo(() => {
    if (!search.trim()) return null; // null = show grouped list
    const q = search.toLowerCase();
    return ALL_TIMEZONES.filter(
      (tz) =>
        tz.label.toLowerCase().includes(q) ||
        tz.value.toLowerCase().includes(q),
    );
  }, [search]);

  const renderRow = (tz: TimezoneEntry) => {
    const selected = currentTimezone === tz.value;
    return (
      <SheetItem
        key={tz.value}
        icon="globe"
        label={tz.label}
        detail={tz.value}
        checked={selected}
        onPress={() => handleSelect(tz.value)}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${tz.label} (${tz.value})`}
      />
    );
  };

  return (
    <SettingsPage title="Timezone">
      <SheetScroll>
        <SheetSearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search timezones…"
          accessibilityLabel="Search timezones"
        />

        {filteredTimezones !== null ? (
          filteredTimezones.length === 0 ? (
            <SheetMessage text="No timezones found" />
          ) : (
            <SheetSection title="Results">
              <SheetGroup>{filteredTimezones.map(renderRow)}</SheetGroup>
            </SheetSection>
          )
        ) : (
          SECTION_DATA.map((section) => (
            <SheetSection key={section.title} title={section.title}>
              <SheetGroup>{section.data.map(renderRow)}</SheetGroup>
            </SheetSection>
          ))
        )}
      </SheetScroll>
    </SettingsPage>
  );
}
