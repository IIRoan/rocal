import { Calendar as CalendarUI } from "@workspace/ui/components/ui/calendar";
import { Button } from "@workspace/ui/components/ui/button";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { Switch } from "@workspace/ui/components/ui/switch";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import type { UserSettings } from "@/lib/types/calendar";
import type { EventEditorFormState } from "./types";

function wallClockTimeParts(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function formatWallClockTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
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
  const startParts = wallClockTimeParts(eventForm.eventStartTime);
  const endParts = wallClockTimeParts(eventForm.eventEndTime);
  const startPickerValue = new Date(
    2000,
    0,
    1,
    startParts.hours,
    startParts.minutes,
    0,
    0,
  );
  const endPickerValue = new Date(
    2000,
    0,
    1,
    endParts.hours,
    endParts.minutes,
    0,
    0,
  );

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">Date & Time</Label>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {desktop ? (
            <Popover
              open={eventForm.startDateOpen}
              onOpenChange={eventForm.setStartDateOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 h-9 justify-start font-normal cursor-pointer bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground"
                >
                  <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                  {format(eventForm.eventStartDate, "EEE, MMM d")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarUI
                  mode="single"
                  selected={eventForm.eventStartDate}
                  weekStartsOn={1}
                  onSelect={(date) => {
                    if (!date) {
                      return;
                    }

                    eventForm.setEventStartDate(date);
                    if (date > eventForm.eventEndDate) {
                      eventForm.setEventEndDate(date);
                    }
                    eventForm.setStartDateOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          ) : (
            <Drawer
              open={eventForm.startDateOpen}
              onOpenChange={(nextOpen) => {
                if (nextOpen) {
                  eventForm.setEndDateOpen(false);
                }
                eventForm.setStartDateOpen(nextOpen);
              }}
            >
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-sm font-medium justify-start text-foreground cursor-pointer"
                >
                  <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                  <span className="truncate">
                    {format(eventForm.eventStartDate, "EEE, MMM d")}
                  </span>
                </Button>
              </DrawerTrigger>
              <DrawerContent responsive responsiveHeight="80dvh" className="pb-safe">
                <DrawerTitle className="sr-only">Select start date</DrawerTitle>
                <div className="flex justify-center p-4 pb-8">
                  <CalendarUI
                    mode="single"
                    selected={eventForm.eventStartDate}
                    weekStartsOn={1}
                    onSelect={(date) => {
                      if (!date) {
                        return;
                      }

                      eventForm.setEventStartDate(date);
                      if (date > eventForm.eventEndDate) {
                        eventForm.setEventEndDate(date);
                      }
                      eventForm.setStartDateOpen(false);
                    }}
                    initialFocus
                  />
                </div>
              </DrawerContent>
            </Drawer>
          )}

          <span className="text-muted-foreground text-sm font-medium">→</span>

          {desktop ? (
            <Popover
              open={eventForm.endDateOpen}
              onOpenChange={eventForm.setEndDateOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 h-9 justify-start font-normal cursor-pointer bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground"
                >
                  <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                  {format(eventForm.eventEndDate, "EEE, MMM d")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarUI
                  mode="single"
                  selected={eventForm.eventEndDate}
                  weekStartsOn={1}
                  disabled={(date) => date < eventForm.eventStartDate}
                  onSelect={(date) => {
                    if (!date) {
                      return;
                    }

                    eventForm.setEventEndDate(date);
                    eventForm.setEndDateOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          ) : (
            <Drawer
              open={eventForm.endDateOpen}
              onOpenChange={(nextOpen) => {
                if (nextOpen) {
                  eventForm.setStartDateOpen(false);
                }
                eventForm.setEndDateOpen(nextOpen);
              }}
            >
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-sm font-medium justify-start text-foreground cursor-pointer"
                >
                  <CalendarIcon className="mr-2 size-4 flex-shrink-0" />
                  <span className="truncate">
                    {format(eventForm.eventEndDate, "EEE, MMM d")}
                  </span>
                </Button>
              </DrawerTrigger>
              <DrawerContent responsive responsiveHeight="80dvh" className="pb-safe">
                <DrawerTitle className="sr-only">Select end date</DrawerTitle>
                <div className="flex justify-center p-4 pb-8">
                  <CalendarUI
                    mode="single"
                    selected={eventForm.eventEndDate}
                    weekStartsOn={1}
                    disabled={(date) => date < eventForm.eventStartDate}
                    onSelect={(date) => {
                      if (!date) {
                        return;
                      }

                      eventForm.setEventEndDate(date);
                      eventForm.setEndDateOpen(false);
                    }}
                    initialFocus
                  />
                </div>
              </DrawerContent>
            </Drawer>
          )}
        </div>

        {!eventForm.eventAllDay && (
          <div className="flex items-center gap-2">
            <ShadcnAutocomleteTimePicker
              value={startPickerValue}
              onChange={(date) => {
                eventForm.handleStartTimeChange(formatWallClockTime(date));
              }}
              is24Hour={localSettings?.timeFormat === "24h"}
              className={`flex-1 h-9 cursor-pointer ${desktop ? "bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground" : ""}`}
            />
            <span className="text-muted-foreground text-sm font-medium">→</span>
            <ShadcnAutocomleteTimePicker
              value={endPickerValue}
              onChange={(date) => {
                eventForm.handleEndTimeChange(formatWallClockTime(date));
              }}
              is24Hour={localSettings?.timeFormat === "24h"}
              className={`flex-1 h-9 cursor-pointer ${desktop ? "bg-input border-0 shadow-none hover:bg-input/80 text-input-foreground" : ""}`}
            />
          </div>
        )}

        {desktop ? (
          <div className="flex items-center gap-2 py-1">
            <Checkbox
              id="event-all-day-checkbox"
              checked={eventForm.eventAllDay}
              onCheckedChange={(checked) =>
                eventForm.setEventAllDay(checked === true)
              }
            />
            <Label htmlFor="event-all-day-checkbox" className="text-sm cursor-pointer">
              All day
            </Label>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full py-3 px-1">
            <span className="text-sm font-medium text-foreground">All day</span>
            <Switch
              checked={eventForm.eventAllDay}
              onCheckedChange={(checked) => eventForm.setEventAllDay(checked)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
