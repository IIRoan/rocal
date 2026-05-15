import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { Calendar, Check, ArrowLeft, BookOpen } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import type { CalendarView } from "@workspace/ui/components/calendar";
import { WORKING_DAYS } from "./constants";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { toast } from "sonner";

interface CalendarDefaultsSettingsProps {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
  workingDaysList: number[];
}

export function CalendarDefaultsSettings({
  localSettings,
  updateSetting,
  goBack,
  workingDaysList,
}: CalendarDefaultsSettingsProps) {
  const { calendars, updateCalendar, refetchCalendars } =
    useSharedCalendarData();
  const editableCalendars = calendars.filter(
    (calendar) => calendar.kind === "owned",
  );
  const defaultCalendar =
    editableCalendars.find((calendar) => calendar.isDefault) ||
    editableCalendars[0];

  const handleDefaultCalendarChange = async (calendarId: string) => {
    try {
      const calendar = editableCalendars.find((item) => item.id === calendarId);
      if (!calendar) return;

      await updateCalendar(calendarId, {
        isDefault: true,
      });

      await refetchCalendars();
      toast.success(`Set "${calendar.name}" as default`);
    } catch (error) {
      toast.error("Failed to update default calendar");
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          onClick={() => goBack()}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Calendar Defaults</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
              {/* Default Calendar - Dropdown */}
              <div className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <BookOpen className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Default calendar</span>
                  </div>
                  <Select
                    value={defaultCalendar?.id}
                    onValueChange={handleDefaultCalendarChange}
                  >
                    <SelectTrigger className="w-[140px] h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {editableCalendars.map((calendar) => (
                        <SelectItem key={calendar.id} value={calendar.id}>
                          {calendar.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Default View - Dropdown */}
              <div className="px-4 py-3 border-b border-border/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Default view</span>
                  </div>
                  <Select
                    value={localSettings.defaultView}
                    onValueChange={(value) =>
                      updateSetting("defaultView", value as CalendarView)
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
                    <Calendar className="size-4 text-muted-foreground shrink-0" />
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
                    <Calendar className="size-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1">{day.label}</span>
                    {workingDaysList.includes(day.value) && (
                      <Check className="size-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
    </div>
  );
}
