import React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { Calendar, Check, ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import type { CalendarView } from "@workspace/ui/components/calendar";
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
    viewKey?: string;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Calendar Defaults</DialogTitle>
        </VisuallyHidden>
        <TransitionContainer
          direction={transitionDirection}
          viewKey="calendar-defaults"
        >
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
              <button
                onClick={() => goBack("main")}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium">Calendar Defaults</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Default View - Dropdown */}
              <div className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Default view</span>
                  </div>
                  <Select
                    value={localSettings.defaultView}
                    onValueChange={(value) =>
                      updateSetting(
                        "defaultView",
                        value as CalendarView,
                      )
                    }
                  >
                    <SelectTrigger className="w-[120px] h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="3day">3 Days</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="agenda">Agenda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* First Day of Week - Dropdown */}
              <div className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">First day of week</span>
                  </div>
                  <Select
                    value={String(localSettings.weekStartDay)}
                    onValueChange={(value) =>
                      updateSetting("weekStartDay", Number(value))
                    }
                  >
                    <SelectTrigger className="w-[120px] h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKING_DAYS.map((day) => (
                        <SelectItem key={day.value} value={String(day.value)}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Working Days */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                Working Days
              </div>
              <div className="p-1">
                {WORKING_DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => {
                      const currentWorkingDays = [...workingDaysList];
                      const dayIndex = currentWorkingDays.indexOf(day.value);
                      if (dayIndex > -1) {
                        currentWorkingDays.splice(dayIndex, 1);
                      } else {
                        currentWorkingDays.push(day.value);
                      }
                      updateSetting(
                        "workingDays",
                        JSON.stringify(currentWorkingDays.sort()),
                      );
                    }}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1">{day.label}</span>
                    {workingDaysList.includes(day.value) && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </TransitionContainer>
      </DialogContent>
    </Dialog>
  );
}
