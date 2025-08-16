"use client";

import React from "react";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { ChevronDown } from "lucide-react";
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
  placeholder = "09:00 or type time",
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
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleDropdownToggle,
    handleOptionSelect,
  } = useTimeInput({
    initialTime: value,
    onTimeChange: onChange,
    pairedTime,
    isPairedAfter,
    timeFormat,
  });

  // Use external error if provided, otherwise use validation error
  const displayError = error || validationError;

  return (
    <div {...containerProps} className={cn("space-y-2 relative", containerProps?.className)}>
      {label && (
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </Label>
      )}
      <div className="relative" data-time-input={isPairedAfter ? "end" : "start"}>
        <Input
          id={id}
          value={time}
          onChange={(e) => handleTimeChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={(e) => handleBlur(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, e.currentTarget.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "pr-10 border-2 transition-colors",
            displayError
              ? 'border-destructive focus:border-destructive'
              : 'hover:border-primary/50 focus:border-primary',
            className
          )}
        />
        <button
          type="button"
          onClick={handleDropdownToggle}
          disabled={disabled}
          className="absolute right-0 top-0 h-full px-3 hover:bg-accent/20 transition-colors rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      
      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-auto"
        >
          {timeOptions
            .filter((option) => {
              if (!pairedTime || isPairedAfter === undefined) return true;
              
              const [optionHours = "0", optionMins = "0"] = option.value.split(':');
              const optionMinutes = parseInt(optionHours) * 60 + parseInt(optionMins);
              const [pairedHours = "0", pairedMins = "0"] = pairedTime.split(':');
              const pairedMinutes = parseInt(pairedHours) * 60 + parseInt(pairedMins);
              
              return isPairedAfter ? optionMinutes > pairedMinutes : optionMinutes < pairedMinutes;
            })
            .map((option) => (
              <button
                key={option.value}
                type="button"
                data-time-value={option.value}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none transition-colors",
                  option.value === time ? 'bg-accent text-accent-foreground font-medium' : ''
                )}
                onClick={() => handleOptionSelect(option.value)}
              >
                {option.label}
              </button>
            ))}
        </div>
      )}
      
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