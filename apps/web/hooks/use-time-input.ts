"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { 
  validateTime, 
  timeToMinutes, 
  minutesToTime, 
  scrollToSelectedTime, 
  generateAllTimeOptions,
  type TimeValidationResult 
} from "@/components/command-palette/time-utils";

interface UseTimeInputProps {
  initialTime?: string;
  onTimeChange?: (time: string) => void;
  pairedTime?: string; // For validation against another time input
  isPairedAfter?: boolean; // Whether this time should be after the paired time
  timeFormat?: string;
}

interface UseTimeInputReturn {
  // State
  time: string;
  isOpen: boolean;
  error: string | undefined;
  timeOptions: Array<{ value: string; label: string }>;
  
  // Refs
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  
  // Actions
  setTime: (time: string) => void;
  setIsOpen: (open: boolean) => void;
  handleTimeChange: (newTime: string) => void;
  handleBlur: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent, value: string) => void;
  handleDropdownToggle: () => void;
  handleOptionSelect: (value: string) => void;
}

export function useTimeInput({
  initialTime = "09:00",
  onTimeChange,
  pairedTime,
  isPairedAfter = false,
  timeFormat,
}: UseTimeInputProps = {}): UseTimeInputReturn {
  const [time, setTime] = useState(initialTime);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Generate time options
  const timeOptions = generateAllTimeOptions(timeFormat);

  // Validate time format only (no paired time validation here)
  const validateAndSetTime = useCallback((newTime: string): TimeValidationResult => {
    // Only validate the time format, not paired time relationships
    // The parent component (event form) handles auto-adjustment of paired times
    return validateTime(newTime);
  }, []);

  // Handle time change with validation
  const handleTimeChange = useCallback((newTime: string) => {
    const validation = validateAndSetTime(newTime);
    
    if (validation.isValid && validation.time) {
      setTime(validation.time);
      setError(undefined);
      onTimeChange?.(validation.time);
    } else {
      setTime(newTime);
      setError(validation.error);
    }
  }, [validateAndSetTime, onTimeChange]);

  // Handle blur with validation (simplified - no longer manages dropdown state)
  const handleBlur = useCallback((value: string) => {
    handleTimeChange(value);
  }, [handleTimeChange]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent, value: string) => {
    if (e.key === "Enter") {
      handleTimeChange(value);
      setIsOpen(false);
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setIsOpen(false);
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIsOpen(true);
    }
  }, [handleTimeChange]);

  // Handle dropdown toggle
  const handleDropdownToggle = useCallback(() => {
    const newOpenState = !isOpen;
    setIsOpen(newOpenState);
    
    if (newOpenState) {
      // Scroll to selected time after dropdown is rendered
      setTimeout(() => scrollToSelectedTime(dropdownRef, time), 100);
    }
  }, [isOpen, time]);

  // Handle option selection
  const handleOptionSelect = useCallback((value: string) => {
    handleTimeChange(value);
    setIsOpen(false);
  }, [handleTimeChange]);

  // Scroll to selected time when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Give the popover time to render and position
      setTimeout(() => scrollToSelectedTime(dropdownRef, time), 200);
    }
  }, [isOpen]);

  // Update time when initialTime changes
  useEffect(() => {
    setTime(initialTime);
  }, [initialTime]);

  return {
    // State
    time,
    isOpen,
    error,
    timeOptions,
    
    // Refs
    dropdownRef,
    
    // Actions
    setTime,
    setIsOpen,
    handleTimeChange,
    handleBlur,
    handleKeyDown,
    handleDropdownToggle,
    handleOptionSelect,
  };
}

// Hook for managing paired time inputs (start/end)
interface UsePairedTimeInputsProps {
  initialStartTime?: string;
  initialEndTime?: string;
  onStartTimeChange?: (time: string) => void;
  onEndTimeChange?: (time: string) => void;
  timeFormat?: string;
}

interface UsePairedTimeInputsReturn {
  startTimeInput: UseTimeInputReturn;
  endTimeInput: UseTimeInputReturn;
  timeErrors: { start?: string; end?: string };
}

export function usePairedTimeInputs({
  initialStartTime = "09:00",
  initialEndTime = "10:00",
  onStartTimeChange,
  onEndTimeChange,
  timeFormat,
}: UsePairedTimeInputsProps = {}): UsePairedTimeInputsReturn {
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);

  // Auto-adjust end time when start time changes
  const handleStartTimeChange = useCallback((newStartTime: string) => {
    setStartTime(newStartTime);
    onStartTimeChange?.(newStartTime);
    
    // Auto-adjust end time if it's not after start time
    const startMinutes = timeToMinutes(newStartTime);
    const endMinutes = timeToMinutes(endTime);
    
    if (endMinutes <= startMinutes) {
      const newEndMinutes = startMinutes + 60;
      const newEndTime = minutesToTime(newEndMinutes);
      setEndTime(newEndTime);
      onEndTimeChange?.(newEndTime);
    }
  }, [endTime, onStartTimeChange, onEndTimeChange]);

  const handleEndTimeChange = useCallback((newEndTime: string) => {
    setEndTime(newEndTime);
    onEndTimeChange?.(newEndTime);
  }, [onEndTimeChange]);

  const startTimeInput = useTimeInput({
    initialTime: startTime,
    onTimeChange: handleStartTimeChange,
    pairedTime: endTime,
    isPairedAfter: false,
    timeFormat,
  });

  const endTimeInput = useTimeInput({
    initialTime: endTime,
    onTimeChange: handleEndTimeChange,
    pairedTime: startTime,
    isPairedAfter: true,
    timeFormat,
  });

  const timeErrors = {
    start: startTimeInput.error,
    end: endTimeInput.error,
  };

  return {
    startTimeInput,
    endTimeInput,
    timeErrors,
  };
}