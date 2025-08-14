import React from "react";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
import {
  Calendar,
  Check,
  ArrowLeft,
} from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { WORKING_DAYS, type PaletteView } from "./constants";

interface CalendarDefaultsSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: (view: PaletteView) => void;
  workingDaysList: number[];
  TransitionContainer: React.ComponentType<{
    direction: "forward" | "back";
    children: React.ReactNode;
  }>;
  transitionDirection: "forward" | "back";
}

export function CalendarDefaultsSettings({
  open,
  onOpenChange,
  localSettings,
  updateSetting,
  goBack,
  workingDaysList,
  TransitionContainer,
  transitionDirection,
}: CalendarDefaultsSettingsProps) {
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
            Calendar Defaults
          </h2>
        </div>
        <CommandList>
          <CommandGroup heading="Week Settings">
            {WORKING_DAYS.map((day) => (
              <CommandItem
                key={day.value}
                onSelect={() => updateSetting("weekStartDay", day.value)}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Calendar className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">
                  Week starts on {day.label}
                </span>
                {localSettings.weekStartDay === day.value && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Working Days">
            {WORKING_DAYS.map((day) => (
              <CommandItem
                key={day.value}
                onSelect={() => {
                  const currentWorkingDays = [...workingDaysList];
                  const dayIndex = currentWorkingDays.indexOf(day.value);
                  if (dayIndex > -1) {
                    currentWorkingDays.splice(dayIndex, 1);
                  } else {
                    currentWorkingDays.push(day.value);
                  }
                  updateSetting(
                    "workingDays",
                    JSON.stringify(currentWorkingDays.sort())
                  );
                }}
                className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
              >
                <Calendar className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="text-foreground">{day.label}</span>
                {workingDaysList.includes(day.value) && (
                  <Check className="ml-auto h-4 w-4 text-primary" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </TransitionContainer>
    </CommandDialog>
  );
}