"use client";

import React, { useEffect, useRef } from "react";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { ChevronDown, ClockIcon } from "lucide-react";
import { useTimeInput } from "@/hooks/use-time-input";
import { cn } from "@workspace/ui/lib/utils";

interface TimeInputProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  pairedTime?: string;
  isPairedAfter?: boolean;
  timeFormat?: string;
  className?: string;
  containerProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function TimeInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  pairedTime,
  isPairedAfter,
  timeFormat,
  className,
  containerProps,
}: TimeInputProps) {
  const {
    time,
    isOpen,
    error: validationError,
    timeOptions,
    dropdownRef,
    handleTimeChange,
    handleBlur,
    handleKeyDown,
    handleDropdownToggle,
    handleOptionSelect,
    setIsOpen,
  } = useTimeInput({
    initialTime: value,
    onTimeChange: onChange,
    pairedTime,
    isPairedAfter,
    timeFormat,
  });

  // Generate time slots every 15 minutes from 0:00 to 23:45
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 0; hour <= 23; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleTimeInputChange = (inputTime: string) => {
    handleTimeChange(inputTime);
  };

  const handleTimeSelect = (selectedTime: string) => {
    onChange(selectedTime);
    setIsOpen(false);
  };

  // Auto-scroll to selected time when popover opens
  useEffect(() => {
    if (isOpen && time && scrollContainerRef.current) {
      const selectedIndex = timeSlots.findIndex(slot => slot === time);
      if (selectedIndex !== -1) {
        const selectedElement = scrollContainerRef.current.querySelector(
          `[data-time-slot="${time}"]`
        ) as HTMLElement;
        if (selectedElement) {
          selectedElement.scrollIntoView({
            behavior: 'instant',
            block: 'center'
          });
        }
      }
    }
  }, [isOpen, time, timeSlots]);

  // Use external error if provided, otherwise use validation error
  const displayError = error || validationError;

  // Generate appropriate placeholder based on time format
  const defaultPlaceholder = timeFormat === "24h" ? "HH:MM" : "HH:MM";
  const finalPlaceholder = placeholder || defaultPlaceholder;

  return (
    <div {...containerProps} className={cn("space-y-2", containerProps?.className)}>
      {label && (
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
      )}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <div className="relative" data-time-input={isPairedAfter ? "end" : "start"}>
          <Input
            id={id}
            value={time}
            onChange={(e) => handleTimeInputChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            onKeyDown={(e) => handleKeyDown(e, e.currentTarget.value)}
            placeholder={finalPlaceholder}
            disabled={disabled}
            className={cn(
              "pr-10 border-2 transition-colors",
              displayError
                ? 'border-destructive focus:border-destructive'
                : 'hover:border-primary/50 focus:border-primary',
              className
            )}
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="absolute right-0 top-0 h-full px-3 hover:bg-accent/20 transition-colors rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
        </div>
        
        <PopoverContent 
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-3 border-b space-y-2">
            <p className="text-sm font-medium">Select time</p>
            <Input
              type="text"
              placeholder="HH:MM"
              value={time}
              onChange={(e) => handleTimeInputChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="text-sm h-8"
              maxLength={5}
            />
          </div>
          <div
            ref={scrollContainerRef}
            className="h-60 overflow-y-auto"
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="p-2 space-y-1">
              {timeSlots.map((timeSlot) => (
                <Button
                  key={timeSlot}
                  data-time-slot={timeSlot}
                  variant={time === timeSlot ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => handleTimeSelect(timeSlot)}
                >
                  <ClockIcon className="mr-2 h-3 w-3" />
                  {timeSlot}
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
      
      {displayError && (
        <p className="text-xs text-destructive flex items-center gap-1 mt-1">
          <span className="inline-block w-3 h-3 rounded-full bg-destructive/20 flex items-center justify-center">
            <span className="text-[8px] text-destructive font-bold">!</span>
          </span>
          {displayError}
        </p>
      )}
    </div>
  );
}

// Paired time inputs component for start/end time selection
interface PairedTimeInputsProps {
  startTime: string;
  endTime: string;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  startLabel?: string;
  endLabel?: string;
  timeFormat?: string;
  disabled?: boolean;
  className?: string;
  startError?: string;
  endError?: string;
}

export function PairedTimeInputs({
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  startLabel = "Start Time",
  endLabel = "End Time",
  timeFormat,
  disabled = false,
  className,
  startError,
  endError,
}: PairedTimeInputsProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-4", className)}>
      <TimeInput
        label={startLabel}
        value={startTime}
        onChange={onStartTimeChange}
        pairedTime={endTime}
        isPairedAfter={false}
        timeFormat={timeFormat}
        disabled={disabled}
        error={startError}
      />
      <TimeInput
        label={endLabel}
        value={endTime}
        onChange={onEndTimeChange}
        pairedTime={startTime}
        isPairedAfter={true}
        timeFormat={timeFormat}
        disabled={disabled}
        error={endError}
      />
    </div>
  );
}