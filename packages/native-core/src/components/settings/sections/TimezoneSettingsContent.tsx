import React, { useCallback, useMemo, useState } from "react";
import { SettingsPage, useSettingsBack } from "../SettingsPage";
import {
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSearchField,
  SheetSection,
} from "../../sheet/SheetSections";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { TIMEZONE_GROUPS, type TimezoneEntry } from "./timezone-options";

const ALL_TIMEZONES = Object.values(TIMEZONE_GROUPS).flat();

const SECTION_DATA = Object.entries(TIMEZONE_GROUPS).map(([title, data]) => ({
  title,
  data,
}));

export function TimezoneSettingsContent() {
  const goBack = useSettingsBack();

  const [search, setSearch] = useState("");

  const { settings, updateSetting } = useNativeUserSettings();

  const currentTimezone =
    settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleSelect = useCallback(
    (timezone: string) => {
      updateSetting({ timezone });
      goBack();
    },
    [updateSetting, goBack],
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
