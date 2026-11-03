import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useId,
  useMemo,
} from "react";
import { Clock } from "lucide-react";
import type { TimeFormat } from "@workspace/calendar-core";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "./button";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./drawer";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { useAutocompleteTimepicker } from "@workspace/ui/hooks/use-autocomplete-timepicker";

const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const INPUT_STYLES =
  "w-7 bg-transparent text-center text-sm font-medium border-none shadow-none outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:text-accent " +
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

interface TimePickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  timeFormat: TimeFormat;
  locale?: string;
  timeZone?: string;
  placeholder?: string;
  /** Names the field, such as "Start time"; the accessible name then reads "Start time, 09:00". */
  label?: string;
  className?: string;
  inline?: boolean;
  variant?: "outline" | "ghost";
}

interface TimeGridProps {
  selectedTime: Date;
  timeOptions: Date[];
  formatTime: (time: Date) => string;
  handleSelect: (time: Date) => void;
  scrollToIndex: number;
  compact?: boolean;
  open?: boolean;
}

function TimeGrid({
  selectedTime,
  timeOptions,
  formatTime,
  handleSelect,
  scrollToIndex,
  compact = false,
  open,
}: TimeGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  useEffect(() => {
    if (open && containerRef.current && scrollToIndex >= 0) {
      const timer = setTimeout(() => {
        const button = containerRef.current?.querySelector(
          `[data-time-index="${scrollToIndex}"]`,
        ) as HTMLElement;
        if (button && containerRef.current) {
          button.scrollIntoView({ behavior: "instant", block: "center" });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, scrollToIndex]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "overflow-y-auto overscroll-contain",
        compact ? "max-h-[300px]" : "h-full",
      )}
    >
      <div
        className={cn(
          "grid gap-2 p-3",
          compact ? "grid-cols-4" : "grid-cols-3",
        )}
      >
        {timeOptions.map((time, index) => {
          const timeString = formatTime(time);
          const isSelected =
            time.getHours() === selectedTime.getHours() &&
            time.getMinutes() === selectedTime.getMinutes();
          const isCurrentTime =
            time.getHours() === now.getHours() &&
            time.getMinutes() === now.getMinutes();

          return (
            <button
              key={timeString}
              type="button"
              data-time-index={index}
              onClick={() => handleSelect(time)}
              className={cn(
                "flex items-center justify-center rounded-lg text-sm font-semibold transition-colors relative cursor-pointer",
                compact ? "h-11 min-w-[80px]" : "h-12",
                isSelected
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : isCurrentTime
                    ? "bg-accent/20 text-accent ring-2 ring-accent hover:bg-accent/30"
                    : "bg-hover hover:bg-hover/80 text-hover-foreground",
              )}
            >
              {timeString}
              {isCurrentTime && !isSelected && (
                <span className="absolute -top-1 -right-1 size-2 bg-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeList({
  selectedTime,
  timeOptions,
  formatTime,
  handleSelect,
  scrollToIndex,
  open,
}: Omit<TimeGridProps, "compact">) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Sets scrollTop before paint: scrollIntoView also scrolls the smooth-scrolling page, and a later focus move cancels that scroll.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const option = container?.querySelector<HTMLElement>(
      `[data-time-index="${scrollToIndex}"]`,
    );
    if (!open || !container || !option) return;
    container.scrollTop =
      option.offsetTop - (container.clientHeight - option.offsetHeight) / 2;
  }, [open, scrollToIndex]);

  return (
    <div
      ref={containerRef}
      className="relative max-h-64 overflow-y-auto overscroll-contain p-1"
    >
      {timeOptions.map((time, index) => {
        const timeString = formatTime(time);
        const isSelected =
          time.getHours() === selectedTime.getHours() &&
          time.getMinutes() === selectedTime.getMinutes();
        return (
          <button
            key={timeString}
            type="button"
            data-time-index={index}
            aria-pressed={isSelected}
            onClick={() => handleSelect(time)}
            className={cn(
              "flex h-8 w-full items-center rounded-md px-2.5 text-sm tabular-nums transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected
                ? "bg-accent text-accent-foreground"
                : "text-popover-foreground hover:bg-hover",
            )}
          >
            {timeString}
          </button>
        );
      })}
    </div>
  );
}

interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => boolean;
  isValid: boolean;
  open?: boolean;
}

function TimeInput({
  value,
  onChange,
  onSubmit,
  isValid,
  open,
}: TimeInputProps) {
  const hhRef = useRef<HTMLInputElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);
  const hours = value.split(":")[0] || "";
  const minutes = value.split(":")[1] || "";

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => hhRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    const validated = raw.length === 2 && parseInt(raw, 10) > 23 ? "23" : raw;
    if (validated.length === 2) {
      onChange(`${validated}:${minutes}`);
      setTimeout(() => mmRef.current?.focus(), 0);
    } else {
      onChange(minutes ? `${validated}:${minutes}` : validated);
    }
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    const validated = raw.length === 2 && parseInt(raw, 10) > 59 ? "59" : raw;
    if (hours.length === 2) {
      onChange(`${hours}:${validated}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === "Backspace" &&
      minutes.length === 0 &&
      e.currentTarget === mmRef.current
    ) {
      e.preventDefault();
      onChange(hours);
      hhRef.current?.focus();
    }
    if (e.key === "Enter" && value.length === 5) {
      if (onSubmit()) {
        onChange("");
      }
    }
  };

  return (
    <div className="flex items-center gap-1 bg-muted/30 rounded-lg px-3 py-2">
      <input
        ref={hhRef}
        type="text"
        inputMode="numeric"
        placeholder="HH"
        aria-label="Hours"
        value={hours}
        onChange={handleHoursChange}
        className={INPUT_STYLES}
        autoComplete="off"
        maxLength={2}
      />
      <span className="text-muted-foreground font-semibold">:</span>
      <input
        ref={mmRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        aria-label="Minutes"
        value={minutes}
        onChange={handleMinutesChange}
        onKeyDown={handleKeyDown}
        className={cn(
          INPUT_STYLES,
          hours.length < 2 && "opacity-50",
        )}
        autoComplete="off"
        maxLength={2}
        disabled={hours.length < 2}
      />
    </div>
  );
}

export function ShadcnAutocomleteTimePicker({
  value,
  onChange,
  timeFormat,
  locale = "en-US",
  timeZone = currentTimezone,
  placeholder = "Select time…",
  label,
  className,
  inline = false,
  variant = "outline",
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState("");
  const isMobile = useIsMobile();
  const timePickerContentId = useId();
  const { timeOptions, formatTime } = useAutocompleteTimepicker({
    timeFormat,
    locale,
    timeZone,
  });

  const selectedTime = useMemo(() => value ?? new Date(), [value]);

  const selectedIndex = timeOptions.findIndex(
    (time) =>
      time.getHours() === selectedTime.getHours() &&
      time.getMinutes() === selectedTime.getMinutes(),
  );

  const getScrollToIndex = useCallback(() => {
    if (selectedIndex !== -1) return selectedIndex;

    const selectedMinutes =
      selectedTime.getHours() * 60 + selectedTime.getMinutes();
    let closestIndex = 0;
    let closestDiff = Infinity;

    for (let i = 0; i < timeOptions.length; i++) {
      const option = timeOptions[i];
      if (!option) continue;
      const optionMinutes = option.getHours() * 60 + option.getMinutes();
      const diff = Math.abs(optionMinutes - selectedMinutes);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }
    return closestIndex;
  }, [selectedIndex, selectedTime, timeOptions]);

  const handleSelect = (time: Date) => {
    const newTime = new Date(selectedTime);
    newTime.setHours(time.getHours(), time.getMinutes(), 0, 0);
    onChange?.(newTime);
    setOpen(false);
  };

  const handleCustomTimeSubmit = () => {
    const match = customTimeInput.match(/^(\d{1,2}):(\d{2})$/);
    if (match?.[1] && match?.[2]) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        const customTime = new Date();
        customTime.setHours(h, m, 0, 0);
        handleSelect(customTime);
        return true;
      }
    }
    return false;
  };

  const currentTimeString = formatTime(selectedTime);
  const triggerLabel = label ? `${label}, ${currentTimeString}` : undefined;

  const triggerButton = inline ? (
    <button
      type="button"
      aria-expanded={open}
      aria-label={triggerLabel}
      aria-controls={timePickerContentId}
      className={cn(
        "outline-none text-foreground font-semibold active:opacity-70 transition-opacity focus-visible:ring-ring focus-visible:ring-[3px] rounded-sm",
        className,
      )}
    >
      {currentTimeString}
    </button>
  ) : (
    <Button
      variant={variant}
      aria-expanded={open}
      aria-label={triggerLabel}
      aria-controls={timePickerContentId}
      className={cn(
        "w-full justify-start font-normal cursor-pointer",
        className,
      )}
    >
      <Clock className="mr-2 size-4 flex-shrink-0" data-testid="ClockIcon" />
      {currentTimeString}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        <DrawerContent
          id={timePickerContentId}
          responsive
          responsiveHeight="300px"
          className="max-h-[300px]"
        >
          <DrawerTitle className="sr-only">Select time</DrawerTitle>
          <div className="flex flex-col items-center flex-1 overflow-y-auto pt-4">
            <TimeGrid
              selectedTime={selectedTime}
              timeOptions={timeOptions}
              formatTime={formatTime}
              handleSelect={handleSelect}
              scrollToIndex={getScrollToIndex()}
              compact
              open={open}
            />
          </div>
          <div className="w-full px-3 pt-3 pb-4 border-t flex justify-center gap-2">
            <TimeInput
              value={customTimeInput}
              onChange={setCustomTimeInput}
              onSubmit={handleCustomTimeSubmit}
              isValid={customTimeInput.length === 5}
              open={open}
            />
            <button
              type="button"
              onClick={() => {
                if (handleCustomTimeSubmit()) {
                  setCustomTimeInput("");
                }
              }}
              disabled={customTimeInput.length !== 5}
              className={cn(
                "h-11 min-w-[80px] flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
                customTimeInput.length === 5
                  ? "bg-accent text-accent-foreground hover:bg-accent/90"
                  : "bg-muted/30 text-muted-foreground",
              )}
            >
              Apply
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        id={timePickerContentId}
        align="start"
        className="w-44 p-0"
      >
        <div className="flex items-center gap-1 border-b border-border p-1.5">
          <TimeInput
            value={customTimeInput}
            onChange={setCustomTimeInput}
            onSubmit={handleCustomTimeSubmit}
            isValid={customTimeInput.length === 5}
            open={open}
          />
          <button
            type="button"
            onClick={() => {
              if (handleCustomTimeSubmit()) {
                setCustomTimeInput("");
              }
            }}
            disabled={customTimeInput.length !== 5}
            className="h-8 flex-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-foreground transition-colors cursor-pointer hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-hover disabled:text-muted-foreground"
          >
            Set
          </button>
        </div>
        <TimeList
          selectedTime={selectedTime}
          timeOptions={timeOptions}
          formatTime={formatTime}
          handleSelect={handleSelect}
          scrollToIndex={getScrollToIndex()}
          open={open}
        />
      </PopoverContent>
    </Popover>
  );
}
