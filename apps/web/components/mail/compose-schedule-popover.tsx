"use client";

import { CalendarDays, ChevronDown, Clock } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";
import {
  formatCalendarDayKey,
  formatInstantCalendarDayKey,
  formatPickerDate,
  formatScheduledSendShortTime,
  parseCalendarDayKey,
  getScheduledSendPresets,
  parseScheduledSendInput,
  resolveMailSendHold,
  scheduledSendLatest,
  shouldEncryptOutgoingMail,
  SCHEDULED_SEND_EXTERNAL_NOTICE,
  type TimeFormat,
} from "@workspace/calendar-core";
import { ShadcnAutocomleteTimePicker } from "@workspace/ui/components/ui/autocompletetimepicker";
import { Button } from "@workspace/ui/components/ui/button";
import { Calendar } from "@workspace/ui/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { cn } from "@workspace/ui/lib/utils";
import { pickerTimeToWallClock, wallClockToPickerTime } from "@/lib/picker-time";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";
import { COMPOSE_MENU_CLASS, ComposeMenuHeading } from "./compose-menu";

export type ComposeScheduling = {
  maxDelayedSendSeconds: number;
  internalDomain: string | null;
  timezone: string;
  timeFormat: TimeFormat;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

// The schedule popover sits at z-[100] over compose, so its day and time lists must stack above it.
const NESTED_PICKER_LAYER = "z-[110]";
const PICKER_FIELD_CLASS = cn(
  PALETTE_INPUT_CLASS,
  "flex cursor-pointer items-center gap-2 text-left font-normal",
);

type ScheduleTriggerProps = ComponentProps<typeof Button> & { scheduledLabel: string | null; split: boolean };

/** Opens the picker; once a time is set it shows that time, so the armed Schedule button is never a surprise. */
function ScheduleTrigger({ scheduledLabel, split, className, ...props }: ScheduleTriggerProps) {
  const label = scheduledLabel ? `Scheduled for ${scheduledLabel}, change schedule` : "Schedule send";
  if (split) {
    // The right half of the Send button, so scheduling reads as another way to send.
    return (
      <Button
        {...props}
        size="sm"
        className={cn("h-9 gap-1 rounded-l-none border-l border-accent-foreground/20 px-2 aria-disabled:opacity-50", className)}
        aria-label={label}
      >
        {scheduledLabel ? <span className="whitespace-nowrap text-xs tabular-nums">{scheduledLabel}</span> : null}
        <ChevronDown aria-hidden />
      </Button>
    );
  }
  return (
    <Button
      {...props}
      size={scheduledLabel ? "xs" : "icon-xs"}
      variant="ghost"
      className={cn("h-7 aria-disabled:opacity-50", scheduledLabel ? "px-2 text-accent" : "w-7", className)}
      aria-label={label}
    >
      <Clock aria-hidden />
      {scheduledLabel ? <span className="whitespace-nowrap tabular-nums">{scheduledLabel}</span> : null}
    </Button>
  );
}

const ROW_CLASS =
  "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ClearScheduleRow({ onClear }: { onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className={ROW_CLASS}>
      <span className="flex-1 whitespace-nowrap">Don&apos;t schedule</span>
      <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">Send right away</span>
    </button>
  );
}

function ScheduleDayField({
  day,
  onDayChange,
  firstDay,
  lastDay,
  weekStartsOn,
  errorId,
}: {
  day: string;
  onDayChange: (day: string) => void;
  firstDay: string;
  lastDay: string;
  weekStartsOn: ComposeScheduling["weekStartsOn"];
  errorId?: string;
}) {
  const [open, setOpen] = useState(false);
  const pickedDay = parseCalendarDayKey(day);
  const dayLabel = pickedDay ? formatPickerDate(pickedDay, "EEE, MMM d") : "Pick a day";
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span aria-hidden>Day</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Day, ${dayLabel}`}
            aria-describedby={errorId}
            className={cn(PICKER_FIELD_CLASS, !pickedDay && "text-muted-foreground")}
          >
            <CalendarDays aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{dayLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className={cn("w-auto p-0", NESTED_PICKER_LAYER)}>
          <Calendar
            mode="single"
            selected={pickedDay ?? undefined}
            defaultMonth={pickedDay ?? parseCalendarDayKey(firstDay) ?? undefined}
            weekStartsOn={weekStartsOn}
            disabled={(date) => {
              const key = formatCalendarDayKey(date);
              return key < firstDay || key > lastDay;
            }}
            onSelect={(date) => {
              if (!date) return;
              onDayChange(formatCalendarDayKey(date));
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ComposeSchedulePopover({
  scheduling,
  recipients,
  disabled,
  scheduledSendAt,
  onSchedule,
  onClear,
  split = false,
}: {
  scheduling: ComposeScheduling;
  recipients: string[];
  disabled: boolean;
  /** The time the composer's Schedule button will use; picking one here never sends. */
  scheduledSendAt: string | null;
  onSchedule: (sendAt: string) => void;
  onClear: () => void;
  /** Render the trigger as the chevron half of the Send button. */
  split?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const hasExternalRecipients =
    recipients.length > 0 && !shouldEncryptOutgoingMail(recipients, scheduling.internalDomain);
  const now = new Date(openedAt);
  const latest = scheduledSendLatest(now.getTime(), scheduling, hasExternalRecipients);
  const presets = getScheduledSendPresets(now, scheduling.timezone, latest);
  const scheduledLabel = scheduledSendAt
    ? formatScheduledSendShortTime(scheduledSendAt, scheduling.timezone, scheduling.timeFormat)
    : null;

  const choose = (sendAt: string | null, now: number) => {
    const resolved = sendAt
      ? resolveMailSendHold({ sendAt, undoSendSeconds: 0, policy: scheduling, hasExternalRecipients, now })
      : { error: "Pick a day and time." };
    if (resolved.error || !sendAt) {
      setError(resolved.error ?? "Pick a day and time.");
      return;
    }
    setError(null);
    setOpen(false);
    onSchedule(sendAt);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) return;
        setError(null);
        setOpenedAt(Date.now());
      }}
    >
      <PopoverTrigger asChild>
        <ScheduleTrigger
          scheduledLabel={scheduledLabel}
          split={split}
          aria-disabled={disabled || undefined}
          disabled={scheduling.maxDelayedSendSeconds <= 0}
        />
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={8} className={cn(COMPOSE_MENU_CLASS, "w-80")}>
        <ComposeMenuHeading>Schedule send</ComposeMenuHeading>
        {scheduledLabel ? (
          <ClearScheduleRow
            onClear={() => {
              onClear();
              setOpen(false);
            }}
          />
        ) : null}
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            onClick={() => choose(preset.sendAt, Date.now())}
            className={ROW_CLASS}
          >
            <Clock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate whitespace-nowrap">{preset.label}</span>
            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {formatScheduledSendShortTime(preset.sendAt, scheduling.timezone, scheduling.timeFormat)}
            </span>
          </button>
        ))}
        <div className="mt-1 grid grid-cols-2 gap-2 border-t border-border px-2 pt-2">
          <ScheduleDayField
            day={day}
            onDayChange={setDay}
            firstDay={formatInstantCalendarDayKey(now, scheduling.timezone)}
            lastDay={formatInstantCalendarDayKey(new Date(latest), scheduling.timezone)}
            weekStartsOn={scheduling.weekStartsOn}
            errorId={error ? `${id}-error` : undefined}
          />
          <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
            <span aria-hidden>Time</span>
            <ShadcnAutocomleteTimePicker
              inline
              label="Time"
              value={wallClockToPickerTime(time)}
              onChange={(date) => setTime(pickerTimeToWallClock(date))}
              timeFormat={scheduling.timeFormat}
              className={PICKER_FIELD_CLASS}
              contentClassName={NESTED_PICKER_LAYER}
            />
          </div>
        </div>
        {hasExternalRecipients ? (
          <p className="px-2 pt-1 text-xs leading-snug text-muted-foreground">{SCHEDULED_SEND_EXTERNAL_NOTICE}</p>
        ) : null}
        {error ? (
          <p id={`${id}-error`} role="alert" className="px-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end px-2 pt-1 pb-1">
          <Button
            size="sm"
            className="h-7 text-xs aria-disabled:opacity-50"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) choose(parseScheduledSendInput(day, time, scheduling.timezone), Date.now());
            }}
          >
            Set time
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
