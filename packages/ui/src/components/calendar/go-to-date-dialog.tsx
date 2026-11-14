"use client";

import { useId, type FormEvent } from "react";
import {
  formatCalendarDayKey,
  parseCalendarDayKey,
  utcToPickerDate,
  wallClockToUtc,
} from "@workspace/calendar-core";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/** Noon on the chosen day, so a DST shift can never move it to the day before. */
function goToDateInstant(dayKey: string, timezone: string): Date | null {
  const day = parseCalendarDayKey(dayKey);
  return day ? wallClockToUtc(day, 12, 0, timezone) : null;
}

export function GoToDateDialog({
  currentDate,
  onGoToDate,
  onOpenChange,
  open,
  timezone,
}: {
  currentDate: Date;
  onGoToDate: (date: Date) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  timezone: string;
}) {
  const inputId = useId();
  const formId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("date");
    const instant =
      typeof value === "string" ? goToDateInstant(value, timezone) : null;
    if (!instant) return;
    onGoToDate(instant);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        aria-describedby={undefined}
        className="w-[calc(100dvw-1rem)] sm:w-auto sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>Go to date</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 px-5 pb-4"
        >
          <Label htmlFor={inputId}>Date</Label>
          <Input
            id={inputId}
            name="date"
            type="date"
            required
            autoFocus
            defaultValue={formatCalendarDayKey(
              utcToPickerDate(currentDate, timezone),
            )}
          />
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} size="sm">
            Go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
