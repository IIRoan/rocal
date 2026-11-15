"use client";

import { Clock } from "lucide-react";
import { useId, useState } from "react";
import {
  formatInstantCalendarDayKey,
  formatScheduledSendTime,
  getScheduledSendPresets,
  parseScheduledSendInput,
  resolveMailSendHold,
  scheduledSendLatest,
  shouldEncryptOutgoingMail,
  SCHEDULED_SEND_EXTERNAL_NOTICE,
  type TimeFormat,
} from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

export type ComposeScheduling = {
  maxDelayedSendSeconds: number;
  internalDomain: string | null;
  timezone: string;
  timeFormat: TimeFormat;
};

export function ComposeSchedulePopover({
  scheduling,
  recipients,
  disabled,
  onSchedule,
}: {
  scheduling: ComposeScheduling;
  recipients: string[];
  disabled: boolean;
  onSchedule: (sendAt: string) => void;
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

  const schedule = (sendAt: string | null) => {
    const resolved = sendAt
      ? resolveMailSendHold({
          sendAt,
          undoSendSeconds: 0,
          policy: scheduling,
          hasExternalRecipients,
          now: Date.now(),
        })
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
        <Button
          size="icon-xs"
          variant="ghost"
          className="h-7 w-7 aria-disabled:opacity-50"
          aria-label="Schedule send"
          aria-disabled={disabled || undefined}
          disabled={scheduling.maxDelayedSendSeconds <= 0}
        >
          <Clock aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="z-[100] flex w-72 max-w-[calc(100dvw-2rem)] flex-col gap-1 p-2">
        <p className="px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">Schedule send</p>
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled}
            onClick={() => schedule(preset.sendAt)}
            className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>{preset.label}</span>
            <span className="text-xs text-muted-foreground">
              {formatScheduledSendTime(preset.sendAt, scheduling.timezone, scheduling.timeFormat)}
            </span>
          </button>
        ))}
        <div className="mt-1 grid grid-cols-2 gap-2 border-t border-border px-2 pt-2">
          <label htmlFor={`${id}-day`} className="flex flex-col gap-1 text-xs text-muted-foreground">
            Day
            <input
              id={`${id}-day`}
              type="date"
              value={day}
              min={formatInstantCalendarDayKey(now, scheduling.timezone)}
              max={formatInstantCalendarDayKey(new Date(latest), scheduling.timezone)}
              onChange={(event) => setDay(event.target.value)}
              className={PALETTE_INPUT_CLASS}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </label>
          <label htmlFor={`${id}-time`} className="flex flex-col gap-1 text-xs text-muted-foreground">
            Time
            <input
              id={`${id}-time`}
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className={PALETTE_INPUT_CLASS}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </label>
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
              if (!disabled) schedule(parseScheduledSendInput(day, time, scheduling.timezone));
            }}
          >
            Schedule
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
