import { useState, useEffect, useRef } from "react";
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
  const { timeOptions, formatTime } = useAutocompleteTimepicker({
    is24Hour,
    locale,
    timeZone,
  });

  const selectedTime = value || new Date();

  // Find the index of the currently selected time
  const selectedIndex = timeOptions.findIndex(
    time => time.getHours() === selectedTime.getHours() && 
            time.getMinutes() === selectedTime.getMinutes()
  );

  const handleSelect = (time: Date) => {
    const newTime = new Date(selectedTime);
    newTime.setHours(time.getHours(), time.getMinutes(), 0, 0);
    onChange?.(newTime);
    setOpen(false);
  };

  const handleCustomTimeInput = (inputValue: string) => {
    // Parse custom time input like "0:05", "12:30", etc.
    const timeRegex = /^(\d{1,2}):(\d{1,2})$/;
    const match = inputValue.match(timeRegex);
    
    if (match && match[1] && match[2]) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      
      // Validate the time
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        const customTime = new Date();
        customTime.setHours(hours, minutes, 0, 0);
        handleSelect(customTime);
        return true;
      }
    }
    return false;
  };

  // Function to check if input is a valid custom time
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

  // Callback ref for scrolling to selected item
  const commandListRef = useRef<HTMLDivElement>(null);
  
  const scrollToSelectedItem = () => {
    if (selectedIndex !== -1 && commandListRef.current && timeOptions[selectedIndex]) {
      const selectedElement = commandListRef.current.querySelector(`[data-value="${formatTime(timeOptions[selectedIndex])}"]`) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ 
          behavior: 'instant', 
          block: 'center' 
        });
      }
    }
  };

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
          // Scroll to selected item after popover opens
          setTimeout(scrollToSelectedItem, 100);
        }}
      >
        <Command className="border-none">
          <CommandInput
            placeholder="Search or type time..."
            data-testid="CommandInput"
            value={searchValue}
            onValueChange={setSearchValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
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
            <CommandEmpty className="text-sm text-muted-foreground py-6 text-center">No time found.</CommandEmpty>
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
      </PopoverContent>
    </Popover>
  );
}