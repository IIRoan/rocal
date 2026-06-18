import React, { useCallback, useMemo, useState } from "react";
import { Input } from "@workspace/ui/components/ui/input";
import {
  Globe,
  Clock,
  Check,
  ArrowLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { stopEventPropagation } from "@/lib/event-propagation";
import {
  SETTINGS_PANEL_STYLE,
  getAllTimezonePickerOptions,
  getTimezonePickerGroups,
  getTimezonePickerLabel,
} from "./constants";

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
  const timezoneGroups = useMemo(() => getTimezonePickerGroups(), []);
  const allTimezones = useMemo(() => getAllTimezonePickerOptions(), []);
  const selectedTimezoneLabel = useMemo(
    () => getTimezonePickerLabel(localSettings.timezone),
    [localSettings.timezone],
  );

  const filteredTimezones = useMemo(() => {
    if (!timezoneSearch.trim()) {
      return [];
    }

    const normalizedQuery = timezoneSearch.trim().toLowerCase();

    return allTimezones
      .filter((timezone) => timezone.searchText.includes(normalizedQuery))
      .slice(0, 50);
  }, [allTimezones, timezoneSearch]);

  const handleTimezoneSelect = useCallback(
    (timezone: string, options?: { clearSearch?: boolean }) => {
      updateSetting("timezone", timezone);

      if (options?.clearSearch) {
        setTimezoneSearch("");
      }

      goBack();
    },
    [updateSetting, goBack],
  );

  if (currentView === "time-region") {
    return (
      <div className="flex flex-col" style={SETTINGS_PANEL_STYLE}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            onClick={() => goBack()}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium">Time & Region</span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
            Timezone
          </div>
          <div className="p-1">
            <button
              type="button"
              onClick={() => goForward("timezone")}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
            >
              <Globe className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm">Timezone</div>
                <div className="text-xs text-muted-foreground truncate">
                  {selectedTimezoneLabel}
                </div>
              </div>
              <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
            </button>
          </div>

          <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
            Time Format
          </div>
          <div className="p-1">
            {[
              { value: "12h", label: "12 Hour (1:00 PM)" },
              { value: "24h", label: "24 Hour (13:00)" },
            ].map((format) => (
              <button
                key={format.value}
                type="button"
                onClick={() => updateSetting("timeFormat", format.value)}
                className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
              >
                <Clock className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1">{format.label}</span>
                {localSettings.timeFormat === format.value && (
                  <Check className="size-4 text-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "timezone") {
    return (
      <div className="flex flex-col" style={SETTINGS_PANEL_STYLE}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            onClick={() => goBack()}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-medium">Timezone</span>
        </div>
        <div className="flex items-center gap-3 px-4 border-b border-border/50 shrink-0">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <Input
            type="text"
            placeholder="Search timezones..."
            value={timezoneSearch}
            onChange={(e) => setTimezoneSearch(e.target.value)}
            onKeyDown={stopEventPropagation}
            className="flex-1 h-auto py-3 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
          {timezoneSearch ? (
            <div className="p-1">
              {filteredTimezones.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No timezones found
                </div>
              ) : (
                filteredTimezones.map((tz) => (
                  <button
                    key={tz.value}
                    type="button"
                    onClick={() =>
                      handleTimezoneSelect(tz.value, { clearSearch: true })
                    }
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <Globe className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{tz.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {tz.value}
                      </div>
                    </div>
                    {localSettings.timezone === tz.value && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          ) : (
            Object.entries(timezoneGroups).map(([groupName, timezones]) => (
              <div key={groupName}>
                <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  {groupName}
                </div>
                <div className="p-1">
                  {timezones.map((tz) => (
                    <button
                      key={tz.value}
                      type="button"
                      onClick={() => handleTimezoneSelect(tz.value)}
                      className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                    >
                      <Globe className="size-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{tz.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {tz.value}
                        </div>
                      </div>
                      {localSettings.timezone === tz.value && (
                        <Check className="size-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return null;
}
