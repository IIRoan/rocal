import React, { useState } from "react";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
import {
  Globe,
  Clock,
  Check,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { TIMEZONE_GROUPS, ALL_TIMEZONES, type PaletteView } from "./constants";

interface TimeRegionSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: (view: PaletteView) => void;
  goForward: (view: PaletteView) => void;
  currentView: string;
  TransitionContainer: React.ComponentType<{
    direction: "forward" | "back";
    children: React.ReactNode;
  }>;
  transitionDirection: "forward" | "back";
}

export function TimeRegionSettings({
  open,
  onOpenChange,
  localSettings,
  updateSetting,
  goBack,
  goForward,
  currentView,
  TransitionContainer,
  transitionDirection,
}: TimeRegionSettingsProps) {
  const [timezoneSearch, setTimezoneSearch] = useState("");

  if (currentView === "time-region") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("main")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">
              Time & Region
            </h2>
          </div>
          <CommandList>
            <CommandGroup heading="Timezone">
              <CommandItem
                onSelect={() => goForward("timezone")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-foreground">Timezone</span>
                  <span className="text-xs text-muted-foreground">
                    {ALL_TIMEZONES.find(
                      (tz) => tz.value === localSettings.timezone
                    )?.label || localSettings.timezone}
                  </span>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Time Format">
              <CommandItem
                onSelect={() => updateSetting("timeFormat", "12h")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">12 Hour (1:00 PM)</span>
                {localSettings.timeFormat === "12h" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
              <CommandItem
                onSelect={() => updateSetting("timeFormat", "24h")}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Clock className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">24 Hour (13:00)</span>
                {localSettings.timeFormat === "24h" && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  if (currentView === "timezone") {
    return (
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <TransitionContainer direction={transitionDirection}>
          <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => goBack("time-region")}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-semibold text-foreground">Timezone</h2>
          </div>
          <div className="bg-muted/30 border-b border-border focus-within:ring-0">
            <input
              type="text"
              placeholder="Search timezones..."
              value={timezoneSearch}
              onChange={(e) => setTimezoneSearch(e.target.value)}
              className="w-full px-4 py-3 bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <CommandList>
            {timezoneSearch ? (
              <CommandGroup heading="Search Results">
                {ALL_TIMEZONES.filter(
                  (tz) =>
                    tz.label
                      .toLowerCase()
                      .includes(timezoneSearch.toLowerCase()) ||
                    tz.value
                      .toLowerCase()
                      .includes(timezoneSearch.toLowerCase())
                )
                  .slice(0, 20)
                  .map((tz) => (
                    <CommandItem
                      key={tz.value}
                      onSelect={() => {
                        updateSetting("timezone", tz.value);
                        setTimezoneSearch("");
                        goBack("time-region");
                      }}
                      className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                    >
                      <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-foreground">{tz.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {tz.value}
                        </span>
                      </div>
                      {localSettings.timezone === tz.value && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ) : (
              Object.entries(TIMEZONE_GROUPS).map(([groupName, timezones]) => (
                <CommandGroup key={groupName} heading={groupName}>
                  {timezones.map((tz) => (
                    <CommandItem
                      key={tz.value}
                      onSelect={() => {
                        updateSetting("timezone", tz.value);
                        goBack("time-region");
                      }}
                      className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
                    >
                      <Globe className="mr-3 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-foreground">{tz.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {tz.value}
                        </span>
                      </div>
                      {localSettings.timezone === tz.value && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </TransitionContainer>
      </CommandDialog>
    );
  }

  return null;
}