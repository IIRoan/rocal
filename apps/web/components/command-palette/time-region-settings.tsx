import React, { useState } from "react";
import { Globe, Clock, Check, Search } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { stopEventPropagation } from "@/lib/event-propagation";
import {
  getAllTimezonePickerOptions,
  getTimezonePickerGroups,
  getTimezonePickerLabel,
} from "./constants";
import {
  PaletteEmptyState,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
  PaletteViewHeader,
} from "./palette-ui";
import { PALETTE_VIEW_STYLE } from "./palette-styles";

const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12 Hour (1:00 PM)" },
  { value: "24h", label: "24 Hour (13:00)" },
] as const;

const selectedCheck = <Check className="size-4 shrink-0 text-foreground" />;

interface TimeRegionSettingsProps {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
  goForward: (view: string) => void;
  currentView: string;
}

export function TimeRegionSettings({
  localSettings,
  updateSetting,
  goBack,
  goForward,
  currentView,
}: TimeRegionSettingsProps) {
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const timezoneGroups = getTimezonePickerGroups();
  const allTimezones = getAllTimezonePickerOptions();
  const selectedTimezoneLabel = getTimezonePickerLabel(localSettings.timezone);
  const normalizedQuery = timezoneSearch.trim().toLowerCase();
  const filteredTimezones = normalizedQuery
    ? allTimezones
        .filter((timezone) => timezone.searchText.includes(normalizedQuery))
        .slice(0, 50)
    : [];

  const handleTimezoneSelect = (
    timezone: string,
    options?: { clearSearch?: boolean },
  ) => {
    updateSetting("timezone", timezone);

    if (options?.clearSearch) {
      setTimezoneSearch("");
    }

    goBack();
  };

  if (currentView === "time-region") {
    return (
      <PaletteView title="Time & Region" onBack={goBack}>
        <PaletteSection label="Timezone">
          <PaletteNavRow
            icon={Globe}
            label="Timezone"
            description={selectedTimezoneLabel}
            onClick={() => goForward("timezone")}
          />
        </PaletteSection>
        <PaletteSection label="Time Format">
          {TIME_FORMAT_OPTIONS.map((format) => (
            <PaletteNavRow
              key={format.value}
              icon={Clock}
              label={format.label}
              onClick={() => updateSetting("timeFormat", format.value)}
              trailing={
                localSettings.timeFormat === format.value ? selectedCheck : null
              }
            />
          ))}
        </PaletteSection>
      </PaletteView>
    );
  }

  if (currentView === "timezone") {
    const renderTimezoneRow = (
      tz: (typeof allTimezones)[number],
      options?: { clearSearch?: boolean },
    ) => (
      <PaletteNavRow
        key={tz.value}
        icon={Globe}
        label={tz.label}
        description={tz.value}
        onClick={() => handleTimezoneSelect(tz.value, options)}
        trailing={localSettings.timezone === tz.value ? selectedCheck : null}
      />
    );

    return (
      <div className="flex flex-col" style={PALETTE_VIEW_STYLE}>
        <PaletteViewHeader title="Timezone" onBack={goBack} />
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/50 px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search timezones..."
            aria-label="Search timezones"
            value={timezoneSearch}
            onChange={(e) => setTimezoneSearch(e.target.value)}
            onKeyDown={stopEventPropagation}
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-[15px] text-foreground shadow-none outline-none placeholder:text-muted-foreground/60 focus:border-0 focus:shadow-none focus:ring-0"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {timezoneSearch ? (
            filteredTimezones.length === 0 ? (
              <PaletteEmptyState>No timezones found</PaletteEmptyState>
            ) : (
              filteredTimezones.map((tz) =>
                renderTimezoneRow(tz, { clearSearch: true }),
              )
            )
          ) : (
            Object.entries(timezoneGroups).map(([groupName, timezones]) => (
              <PaletteSection key={groupName} label={groupName}>
                {timezones.map((tz) => renderTimezoneRow(tz))}
              </PaletteSection>
            ))
          )}
        </div>
      </div>
    );
  }

  return null;
}
