import { useState } from "react";
import { Calendar as CalendarUI } from "@workspace/ui/components/ui/calendar";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";
import { cn } from "@workspace/ui/lib/utils";
import { format } from "date-fns";
import { Check, ChevronDown, Clock, Repeat } from "lucide-react";
import { findRepeatPreset, getRepeatPresets } from "@workspace/calendar-core";

import { getRecurringRuleSummary } from "@/lib/event-editor-view-model";
import type { RecurrenceRule, UserSettings } from "@/lib/types/calendar";
import { RecurringEventForm } from "../command-palette/recurring-event-form";
import { EventEditorRow } from "./event-editor-row";
import { chipClass } from "./event-editor-styles";
import type { EventEditorFormState } from "./types";

const DEFAULT_CUSTOM_RULE: RecurrenceRule = { frequency: "weekly", interval: 1 };

function toPickerTime(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(2000, 0, 1, hours || 0, minutes || 0, 0, 0);
}

function formatWallClockTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function DateChip({
  align,
  desktop,
  disabled,
  label,
  muted,
  onOpenChange,
  onSelect,
  open,
  value,
}: {
  align: "start" | "end";
  desktop?: boolean;
  disabled?: (date: Date) => boolean;
  label: string;
  muted?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (date: Date) => void;
  open: boolean;
  value: Date;
}) {
  const trigger = (
    <button
      type="button"
      aria-label={`${label}: ${format(value, "EEEE, MMMM d")}`}
      className={cn(chipClass(desktop), muted && "text-muted-foreground")}
    >
      {format(value, "EEE, MMM d")}
    </button>
  );
  const calendar = (
    <CalendarUI
      mode="single"
      selected={value}
      weekStartsOn={1}
      disabled={disabled}
      onSelect={(date) => {
        if (date) {
          onSelect(date);
        }
      }}
      initialFocus
    />
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={align}>
          {calendar}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent responsive responsiveHeight="80dvh" className="pb-safe">
        <DrawerTitle className="sr-only">{label}</DrawerTitle>
        <div className="flex justify-center p-4 pb-8">{calendar}</div>
      </DrawerContent>
    </Drawer>
  );
}

function RepeatMenu({
  desktop,
  eventForm,
  onCustom,
  onPreset,
}: {
  desktop?: boolean;
  eventForm: EventEditorFormState;
  onCustom: () => void;
  onPreset: () => void;
}) {
  const presets = getRepeatPresets(eventForm.eventStartDate);
  const activePreset = eventForm.isRecurring
    ? findRepeatPreset(presets, eventForm.recurrenceRule)
    : null;
  const label = !eventForm.isRecurring
    ? "Does not repeat"
    : (activePreset?.label ??
      (eventForm.recurrenceRule
        ? getRecurringRuleSummary(eventForm.recurrenceRule)
        : "Custom"));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Repeat: ${label}`}
          className={cn(
            chipClass(desktop),
            "max-w-full",
            !eventForm.isRecurring && "text-muted-foreground",
          )}
        >
          <Repeat className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem
          onSelect={() => {
            eventForm.setIsRecurring(false);
            onPreset();
          }}
        >
          <Check
            className={cn("size-4", eventForm.isRecurring && "opacity-0")}
          />
          Does not repeat
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {presets.map((preset) => (
          <DropdownMenuItem
            key={preset.key}
            onSelect={() => {
              eventForm.setIsRecurring(true);
              eventForm.setRecurrenceRule(preset.rule);
              onPreset();
            }}
          >
            <Check
              className={cn(
                "size-4",
                activePreset?.key !== preset.key && "opacity-0",
              )}
            />
            {preset.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCustom}>
          <Check
            className={cn(
              "size-4",
              (!eventForm.isRecurring || activePreset) && "opacity-0",
            )}
          />
          Custom…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function EventEditorDateTimeFields({
  desktop,
  eventForm,
  localSettings,
}: {
  desktop?: boolean;
  eventForm: EventEditorFormState;
  localSettings: UserSettings | null | undefined;
}) {
  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);
  const is24Hour = localSettings?.timeFormat === "24h";
  const sameDay =
    format(eventForm.eventStartDate, "yyyy-MM-dd") ===
    format(eventForm.eventEndDate, "yyyy-MM-dd");
  const showCustomRepeat =
    eventForm.isRecurring &&
    eventForm.recurrenceRule !== null &&
    (customRepeatOpen ||
      findRepeatPreset(
        getRepeatPresets(eventForm.eventStartDate),
        eventForm.recurrenceRule,
      ) === null);

  return (
    <EventEditorRow desktop={desktop} icon={Clock} label="Date and time">
      <div className="flex flex-wrap items-center gap-1">
        <DateChip
          align="start"
          desktop={desktop}
          label="Start date"
          open={eventForm.startDateOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              eventForm.setEndDateOpen(false);
            }
            eventForm.setStartDateOpen(nextOpen);
          }}
          value={eventForm.eventStartDate}
          onSelect={(date) => {
            eventForm.setEventStartDate(date);
            if (date > eventForm.eventEndDate) {
              eventForm.setEventEndDate(date);
            }
            eventForm.setStartDateOpen(false);
          }}
        />
        {!eventForm.eventAllDay && (
          <ShadcnAutocomleteTimePicker
            inline
            value={toPickerTime(eventForm.eventStartTime)}
            onChange={(date) =>
              eventForm.handleStartTimeChange(formatWallClockTime(date))
            }
            is24Hour={is24Hour}
            className={chipClass(desktop)}
          />
        )}
        <span aria-hidden className="px-0.5 text-sm text-muted-foreground">
          –
        </span>
        {!eventForm.eventAllDay && (
          <ShadcnAutocomleteTimePicker
            inline
            value={toPickerTime(eventForm.eventEndTime)}
            onChange={(date) =>
              eventForm.handleEndTimeChange(formatWallClockTime(date))
            }
            is24Hour={is24Hour}
            className={chipClass(desktop)}
          />
        )}
        <DateChip
          align="end"
          desktop={desktop}
          label="End date"
          muted={sameDay && !eventForm.eventAllDay}
          open={eventForm.endDateOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              eventForm.setStartDateOpen(false);
            }
            eventForm.setEndDateOpen(nextOpen);
          }}
          value={eventForm.eventEndDate}
          disabled={(date) => date < eventForm.eventStartDate}
          onSelect={(date) => {
            eventForm.setEventEndDate(date);
            eventForm.setEndDateOpen(false);
          }}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-pressed={eventForm.eventAllDay}
          onClick={() => eventForm.setEventAllDay(!eventForm.eventAllDay)}
          className={cn(
            chipClass(desktop),
            !eventForm.eventAllDay && "text-muted-foreground",
          )}
        >
          {eventForm.eventAllDay && <Check className="size-3.5" />}
          All day
        </button>
        <RepeatMenu
          desktop={desktop}
          eventForm={eventForm}
          onPreset={() => setCustomRepeatOpen(false)}
          onCustom={() => {
            if (!eventForm.isRecurring || !eventForm.recurrenceRule) {
              eventForm.setIsRecurring(true);
              eventForm.setRecurrenceRule({
                ...DEFAULT_CUSTOM_RULE,
                byWeekDay: [eventForm.eventStartDate.getDay()],
              });
            }
            setCustomRepeatOpen(true);
          }}
        />
      </div>

      {showCustomRepeat && eventForm.recurrenceRule && (
        <div className="animate-fade-in">
          <RecurringEventForm
            rule={eventForm.recurrenceRule}
            onChange={eventForm.setRecurrenceRule}
          />
        </div>
      )}
    </EventEditorRow>
  );
}
