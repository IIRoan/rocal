import React, { useState } from "react";
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
import { TIMEZONE_GROUPS, ALL_TIMEZONES, type PaletteView } from "./constants";

interface TimeRegionSettingsProps {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
  goForward: (view: PaletteView) => void;
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

  if (currentView === "time-region") {
    return (
      <div className="flex flex-col">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
                <button
                  onClick={() => goBack()}
                  className="p-1 rounded hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium">Time & Region</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* Timezone */}
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Timezone
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => goForward("timezone")}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">Timezone</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {ALL_TIMEZONES.find(
                          (tz) => tz.value === localSettings.timezone,
                        )?.label || localSettings.timezone}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  </button>
                </div>

                {/* Time Format */}
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
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1">{format.label}</span>
                      {localSettings.timeFormat === format.value && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
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
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
          <button
            onClick={() => goBack()}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium">Timezone</span>
              </div>
              {/* Search */}
              <div className="flex items-center gap-3 px-4 border-b border-border/50 shrink-0">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  type="text"
                  placeholder="Search timezones..."
                  value={timezoneSearch}
                  onChange={(e) => setTimezoneSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex-1 h-auto py-3 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {timezoneSearch ? (
                  <div className="p-1">
                    {ALL_TIMEZONES.filter(
                      (tz) =>
                        tz.label
                          .toLowerCase()
                          .includes(timezoneSearch.toLowerCase()) ||
                        tz.value
                          .toLowerCase()
                          .includes(timezoneSearch.toLowerCase()),
                    )
                      .slice(0, 20)
                      .map((tz) => (
                        <button
                          key={tz.value}
                          type="button"
                          onClick={() => {
                            updateSetting("timezone", tz.value);
                            setTimezoneSearch("");
                            goBack();
                          }}
                          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                        >
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{tz.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {tz.value}
                            </div>
                          </div>
                          {localSettings.timezone === tz.value && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                  </div>
                ) : (
                  Object.entries(TIMEZONE_GROUPS).map(
                    ([groupName, timezones]) => (
                      <div key={groupName}>
                        <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                          {groupName}
                        </div>
                        <div className="p-1">
                          {timezones.map((tz) => (
                            <button
                              key={tz.value}
                              type="button"
                              onClick={() => {
                                updateSetting("timezone", tz.value);
                                goBack();
                              }}
                              className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                            >
                              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">
                                  {tz.label}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {tz.value}
                                </div>
                              </div>
                              {localSettings.timezone === tz.value && (
                                <Check className="h-4 w-4 text-primary shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>
      </div>
    );
  }

  return null;
}
