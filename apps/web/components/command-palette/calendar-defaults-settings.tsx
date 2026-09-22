import React, { type ComponentType, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { Calendar, Check, BookOpen } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import type { CalendarView } from "@workspace/ui/components/calendar";
import { WORKING_DAYS } from "./constants";
import { useSharedCalendarData } from "@/components/calendar-data-provider";
import { toast } from "sonner";
import {
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "./palette-ui";

const selectedCheck = <Check className="size-4 shrink-0 text-foreground" />;

const SELECT_TRIGGER_CLASS = "h-8 rounded-lg bg-muted text-[15px] shadow-none";

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

  const toggleWorkingDay = (dayValue: number) => {
    const currentWorkingDays = [...workingDaysList];
    const dayIndex = currentWorkingDays.indexOf(dayValue);
    if (dayIndex > -1) {
      currentWorkingDays.splice(dayIndex, 1);
    } else {
      currentWorkingDays.push(dayValue);
    }
    updateSetting("workingDays", JSON.stringify(currentWorkingDays.sort()));
  };

  return (
    <PaletteView title="Calendar Defaults" onBack={goBack}>
      <PaletteSection>
        <SelectRow icon={BookOpen} label="Default calendar">
          <Select
            value={defaultCalendar?.id}
            onValueChange={handleDefaultCalendarChange}
          >
            <SelectTrigger className={`w-[140px] ${SELECT_TRIGGER_CLASS}`}>
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
        </SelectRow>

        <SelectRow icon={Calendar} label="Default view">
          <Select
            value={localSettings.defaultView}
            onValueChange={(value) =>
              updateSetting("defaultView", value as CalendarView)
            }
          >
            <SelectTrigger className={`w-[120px] ${SELECT_TRIGGER_CLASS}`}>
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
        </SelectRow>

        <SelectRow icon={Calendar} label="First day of week">
          <Select
            value={String(localSettings.weekStartDay)}
            onValueChange={(value) =>
              updateSetting("weekStartDay", Number(value))
            }
          >
            <SelectTrigger className={`w-[120px] ${SELECT_TRIGGER_CLASS}`}>
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
        </SelectRow>
      </PaletteSection>

      <PaletteSection label="Working Days">
        {WORKING_DAYS.map((day) => (
          <PaletteNavRow
            key={day.value}
            icon={Calendar}
            label={day.label}
            onClick={() => toggleWorkingDay(day.value)}
            trailing={
              workingDaysList.includes(day.value) ? selectedCheck : null
            }
          />
        ))}
      </PaletteSection>
    </PaletteView>
  );
}

function SelectRow({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-2 py-1.5 sm:min-h-9">
      <PaletteIconBox>
        <Icon className="size-4" />
      </PaletteIconBox>
      <span className="flex-1 text-[15px] leading-[130%] text-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
