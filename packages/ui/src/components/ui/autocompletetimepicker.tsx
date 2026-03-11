import { useState, useRef, useEffect, useCallback } from "react";
import { Check, ChevronsUpDown, Clock } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/navigation/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/ui/drawer";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";

import { useAutocompleteTimepicker } from "@workspace/ui/hooks/use-autocomplete-timepicker";

const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface TimePickerProps {
  value?: Date;
  onChange?: (date: Date) => void;
  is24Hour?: boolean;
  locale?: string;
  timeZone?: string;
  placeholder?: string;
  className?: string;
  inline?: boolean;
}

function DesktopTimePickerContent({
  selectedTime,
  timeOptions,
  formatTime,
  searchValue,
  setSearchValue,
  handleSelect,
  handleCustomTimeInput,
  isValidCustomTime,
  commandListRef,
}: {
  selectedTime: Date;
  timeOptions: Date[];
  formatTime: (time: Date) => string;
  searchValue: string;
  setSearchValue: (value: string) => void;
  handleSelect: (time: Date) => void;
  handleCustomTimeInput: (inputValue: string) => boolean;
  isValidCustomTime: (inputValue: string) => boolean;
  commandListRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <Command className="border-none">
      <CommandInput
        placeholder="Search or type time..."
        data-testid="CommandInput"
        value={searchValue}
        onValueChange={setSearchValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const inputValue = searchValue.trim();
            if (handleCustomTimeInput(inputValue)) {
              e.preventDefault();
              setSearchValue("");
            }
          }
        }}
        className="border-b border-border text-sm font-medium"
      />
      <CommandList
        ref={commandListRef}
        className="max-h-[200px] overflow-y-auto"
        onWheel={(e) => e.stopPropagation()}
      >
        <CommandEmpty className="text-sm text-muted-foreground py-6 text-center">
          No time found.
        </CommandEmpty>
        {searchValue && isValidCustomTime(searchValue) && (
          <CommandGroup heading="Custom Time" className="px-2 py-1.5">
            <CommandItem
              value={`custom-${searchValue}`}
              onSelect={() => {
                handleCustomTimeInput(searchValue);
                setSearchValue("");
              }}
              className="text-primary font-semibold rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
            >
              <Clock className="mr-2 h-4 w-4" />
              Use "{searchValue}" (Press Enter)
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup className="px-2 py-1">
          {timeOptions.map((time, index) => {
            const timeString = formatTime(time);
            const isSelected =
              time.getHours() === selectedTime.getHours() &&
              time.getMinutes() === selectedTime.getMinutes();
            return (
              <CommandItem
                key={index}
                value={timeString}
                onSelect={() => handleSelect(time)}
                className={cn(
                  "rounded-md px-2 py-1.5 cursor-pointer font-medium text-sm",
                  isSelected && "bg-accent text-foreground"
                )}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    isSelected ? "opacity-100 text-primary" : "opacity-0"
                  )}
                />
                {timeString}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

interface MobileTimePickerContentProps {
  selectedTime: Date;
  timeOptions: Date[];
  formatTime: (time: Date) => string;
  handleSelect: (time: Date) => void;
  scrollToIndex: number;
}

function MobileTimePickerContent({
  selectedTime,
  timeOptions,
  formatTime,
  handleSelect,
  scrollToIndex,
}: MobileTimePickerContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);

  // Scroll on mount
  useEffect(() => {
    if (containerRef.current && !scrolledRef.current && scrollToIndex >= 0) {
      scrolledRef.current = true;
      requestAnimationFrame(() => {
        const button = containerRef.current?.querySelector(
          `[data-time-index="${scrollToIndex}"]`
        ) as HTMLElement;
        if (button && containerRef.current) {
          const containerHeight = containerRef.current.clientHeight;
          const buttonTop = button.offsetTop;
          const buttonHeight = button.offsetHeight;
          const scrollTop = buttonTop - containerHeight / 2 + buttonHeight / 2;
          containerRef.current.scrollTop = Math.max(0, scrollTop);
        }
      });
    }
  }, [scrollToIndex]);

  return (
    <div
      ref={containerRef}
      className="h-full max-h-[70dvh] overflow-y-auto overscroll-contain"
    >
      <div className="grid grid-cols-3 gap-1 p-2">
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
              onClick={() => handleSelect(time)}
              className={cn(
                "flex items-center justify-center h-12 rounded-lg text-sm font-medium transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 hover:bg-muted active:bg-muted/80"
              )}
            >
              {timeString}
            </button>
          );
        })}
      </div>
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
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const isMobile = useIsMobile();
  const { timeOptions, formatTime } = useAutocompleteTimepicker({
    is24Hour,
    locale,
    timeZone,
  });

  const selectedTime = value || new Date();

  const commandListRef = useRef<HTMLDivElement>(null);

  // Find index of selected time
  const selectedIndex = timeOptions.findIndex(
    (time) =>
      time.getHours() === selectedTime.getHours() &&
      time.getMinutes() === selectedTime.getMinutes()
  );

  // Get scroll target index - selected time or closest upcoming time
  const getScrollToIndex = useCallback(() => {
    if (selectedIndex !== -1) return selectedIndex;

    // Find closest time >= current time
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < timeOptions.length; i++) {
      const option = timeOptions[i];
      if (!option) continue;
      const optionMinutes = option.getHours() * 60 + option.getMinutes();
      if (optionMinutes >= currentMinutes) {
        return i;
      }
    }
    return 0;
  }, [selectedIndex, timeOptions]);

  const handleSelect = (time: Date) => {
    const newTime = new Date(selectedTime);
    newTime.setHours(time.getHours(), time.getMinutes(), 0, 0);
    onChange?.(newTime);
    setOpen(false);
  };

  const handleCustomTimeInput = (inputValue: string) => {
    const timeRegex = /^(\d{1,2}):(\d{1,2})$/;
    const match = inputValue.match(timeRegex);

    if (match && match[1] && match[2]) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        const customTime = new Date();
        customTime.setHours(hours, minutes, 0, 0);
        handleSelect(customTime);
        return true;
      }
    }
    return false;
  };

  const isValidCustomTime = (inputValue: string) => {
    const timeRegex = /^(\d{1,2}):(\d{1,2})$/;
    const match = inputValue.match(timeRegex);

    if (match && match[1] && match[2]) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
    }
    return false;
  };

  const currentTimeString = formatTime(selectedTime);

  const scrollToSelectedItem = () => {
    if (
      selectedIndex !== -1 &&
      commandListRef.current &&
      timeOptions[selectedIndex]
    ) {
      const selectedElement = commandListRef.current.querySelector(
        `[data-value="${formatTime(timeOptions[selectedIndex])}"]`
      ) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: "instant",
          block: "center",
        });
      }
    }
  };

  // Mobile: use Drawer
  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(newOpen) => {
          setOpen(newOpen);
          if (!newOpen) {
            setSearchValue("");
          }
        }}
      >
        <DrawerTrigger asChild>
          {inline ? (
            <button
              role="combobox"
              aria-expanded={open}
              className={cn(
                "outline-none text-foreground font-semibold active:opacity-70 transition-opacity",
                className
              )}
            >
              {currentTimeString}
            </button>
          ) : (
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn("w-full justify-between", className)}
            >
              <div className="flex items-center">
                <Clock className="mr-2 h-4 w-4" data-testid="ClockIcon" />
                {currentTimeString}
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          )}
        </DrawerTrigger>
        <DrawerContent className="max-h-[80dvh]">
          <DrawerTitle className="sr-only">Select time</DrawerTitle>
          <MobileTimePickerContent
            selectedTime={selectedTime}
            timeOptions={timeOptions}
            formatTime={formatTime}
            handleSelect={handleSelect}
            scrollToIndex={getScrollToIndex()}
          />
        </DrawerContent>
      </Drawer>
    );
  }

  // Desktop: use Popover
  return (
    <Popover
      open={open}
      onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (!newOpen) {
          setSearchValue("");
        }
      }}
    >
      <PopoverTrigger asChild>
        {inline ? (
          <button
            role="combobox"
            aria-expanded={open}
            className={cn(
              "outline-none text-foreground font-semibold hover:text-primary transition-colors duration-150 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary after:opacity-0 hover:after:opacity-100 after:transition-opacity",
              className
            )}
          >
            {currentTimeString}
          </button>
        ) : (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", className)}
          >
            <div className="flex items-center">
              <Clock className="mr-2 h-4 w-4" data-testid="ClockIcon" />
              {currentTimeString}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-[200px] p-0 border-border shadow-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(scrollToSelectedItem, 100);
        }}
      >
        <DesktopTimePickerContent
          selectedTime={selectedTime}
          timeOptions={timeOptions}
          formatTime={formatTime}
          searchValue={searchValue}
          setSearchValue={setSearchValue}
          handleSelect={handleSelect}
          handleCustomTimeInput={handleCustomTimeInput}
          isValidCustomTime={isValidCustomTime}
          commandListRef={commandListRef}
        />
      </PopoverContent>
    </Popover>
  );
}