import { useState, useRef, useEffect, useCallback } from "react";
import { Clock } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { useAutocompleteTimepicker } from "@workspace/ui/hooks/use-autocomplete-timepicker";

const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const INPUT_STYLES =
  "w-7 bg-transparent text-center text-sm font-medium outline-none border-none shadow-none " +
  "focus:outline-none focus:ring-0 focus:shadow-none " +
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

interface TimePickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  is24Hour?: boolean;
  locale?: string;
  timeZone?: string;
  placeholder?: string;
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
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : isCurrentTime
                    ? "bg-primary/20 text-primary ring-2 ring-primary hover:bg-primary/30"
                    : "bg-accent hover:bg-accent/80 text-accent-foreground",
              )}
            >
              {timeString}
              {isCurrentTime && !isSelected && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
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

  // Auto-focus HH input when drawer opens
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
        value={hours}
        onChange={handleHoursChange}
        className={cn(INPUT_STYLES, "focus:text-primary")}
        autoComplete="off"
        maxLength={2}
      />
      <span className="text-muted-foreground font-semibold">:</span>
      <input
        ref={mmRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={minutes}
        onChange={handleMinutesChange}
        onKeyDown={handleKeyDown}
        className={cn(
          INPUT_STYLES,
          "focus:text-primary",
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
  is24Hour = false,
  locale = "en-US",
  timeZone = currentTimezone,
  placeholder = "Select time...",
  className,
  inline = false,
  variant = "outline",
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState("");
  const isMobile = useIsMobile();
  const { timeOptions, formatTime } = useAutocompleteTimepicker({
    is24Hour,
    locale,
    timeZone,
  });

  const selectedTime = value || new Date();

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

  const triggerButton = inline ? (
    <button
      role="combobox"
      aria-expanded={open}
      className={cn(
        "outline-none text-foreground font-semibold active:opacity-70 transition-opacity",
        className,
      )}
    >
      {currentTimeString}
    </button>
  ) : (
    <Button
      variant={variant}
      role="combobox"
      aria-expanded={open}
      className={cn(
        "w-full justify-start font-normal cursor-pointer",
        className,
      )}
    >
      <Clock className="mr-2 h-4 w-4 flex-shrink-0" data-testid="ClockIcon" />
      {currentTimeString}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        <DrawerContent className="max-h-[300px]">
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
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
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
    <Drawer open={open} onOpenChange={setOpen} direction="bottom">
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent className="max-h-[400px]">
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
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
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
