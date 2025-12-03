"use client";

import React, { useState, useEffect } from "react";
import { Label } from "@workspace/ui/components/ui/label";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { Calendar as CalendarUI } from "@workspace/ui/components/ui/calendar";
import { format } from "date-fns";
import {
  CalendarIcon,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react";
import { calendarApiService } from "@/lib/calendar-api-service";
import type {
  RecurrenceRule,
  RecurrenceFrequency,
  RecurrencePatterns,
} from "@/lib/types/calendar";
import { useQuery } from "@tanstack/react-query";

interface RecurringEventFormProps {
  isRecurring: boolean;
  onIsRecurringChange: (isRecurring: boolean) => void;
  recurrenceRule: RecurrenceRule | null;
  onRecurrenceRuleChange: (rule: RecurrenceRule | null) => void;
  eventStartDate: Date;
  eventEndDate: Date;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function RecurringEventForm({
  isRecurring,
  onIsRecurringChange,
  recurrenceRule,
  onRecurrenceRuleChange,
  eventStartDate,
  eventEndDate,
}: RecurringEventFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRule, setCustomRule] = useState<RecurrenceRule>({
    frequency: "weekly",
    interval: 1,
  });
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Load common patterns
  const { data: patterns = {}, isLoading: patternsLoading } = useQuery({
    queryKey: ["recurrencePatterns"],
    queryFn: () => calendarApiService.getRecurrencePatterns(),
    staleTime: Infinity, // Patterns are unlikely to change often
  });

  // Initialize custom rule when recurring is enabled
  useEffect(() => {
    if (isRecurring && !recurrenceRule) {
      onRecurrenceRuleChange(customRule);
    }
  }, [isRecurring, recurrenceRule, customRule, onRecurrenceRuleChange]);


  const handlePatternSelect = (patternKey: string) => {
    const pattern = patterns[patternKey];
    if (pattern) {
      setCustomRule(pattern.rule);
      onRecurrenceRuleChange(pattern.rule);
      setShowAdvanced(false);
    }
  };

  const handleCustomRuleUpdate = (updates: Partial<RecurrenceRule>) => {
    const newRule = { ...customRule, ...updates };
    setCustomRule(newRule);
    onRecurrenceRuleChange(newRule);
  };

  const handleWeekdayToggle = (day: number) => {
    const currentDays = customRule.byWeekDay || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();

    handleCustomRuleUpdate({
      byWeekDay: newDays.length > 0 ? newDays : undefined,
    });
  };

  const handleEndDateSet = (date: Date | undefined) => {
    if (date) {
      handleCustomRuleUpdate({
        until: date.toISOString(),
        count: undefined, // Clear count if setting until date
      });
      setEndDateOpen(false);
    }
  };

  const handleCountSet = (count: number | undefined) => {
    handleCustomRuleUpdate({
      count,
      until: undefined, // Clear until if setting count
    });
  };

  if (!isRecurring) {
    return (
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="recurring"
            checked={isRecurring}
            onCheckedChange={(checked) => onIsRecurringChange(checked === true)}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label
            htmlFor="recurring"
            className="text-sm font-medium cursor-pointer flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            Make this a recurring event
          </Label>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4 border border-border rounded-md bg-card/50">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="recurring"
            checked={isRecurring}
            onCheckedChange={(checked) => onIsRecurringChange(checked === true)}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label
            htmlFor="recurring"
            className="text-sm font-medium cursor-pointer flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            Recurring Event
          </Label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs"
        >
          {showAdvanced ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Simple
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Advanced
            </>
          )}
        </Button>
      </div>

      {!showAdvanced ? (
        /* Simple Mode - Common Patterns */
        <div className="space-y-3">
          <Label className="text-sm font-medium">Choose a pattern:</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {patternsLoading ? (
              <div className="col-span-2 flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">
                  Loading patterns...
                </span>
              </div>
            ) : (
              Object.entries(patterns).map(([key, pattern]) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePatternSelect(key)}
                  className={`justify-start text-left h-auto py-2 px-3 ${
                    JSON.stringify(pattern.rule) ===
                    JSON.stringify(recurrenceRule)
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm">
                      {pattern.description}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {pattern.rule.frequency.charAt(0).toUpperCase() +
                        pattern.rule.frequency.slice(1)}
                      {pattern.rule.interval > 1 &&
                        ` (Every ${pattern.rule.interval})`}
                    </div>
                  </div>
                </Button>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Advanced Mode - Custom Configuration */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Frequency */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Repeat</Label>
              <Select
                value={customRule.frequency}
                onValueChange={(value: RecurrenceFrequency) =>
                  handleCustomRuleUpdate({
                    frequency: value,
                    byWeekDay: undefined,
                    byMonthDay: undefined,
                    byMonth: undefined,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Interval */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Every</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="99"
                  value={customRule.interval}
                  onChange={(e) =>
                    handleCustomRuleUpdate({
                      interval: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-20 sm:w-24"
                />
                <span className="text-sm text-muted-foreground">
                  {customRule.frequency === "daily" &&
                    (customRule.interval === 1 ? "day" : "days")}
                  {customRule.frequency === "weekly" &&
                    (customRule.interval === 1 ? "week" : "weeks")}
                  {customRule.frequency === "monthly" &&
                    (customRule.interval === 1 ? "month" : "months")}
                  {customRule.frequency === "yearly" &&
                    (customRule.interval === 1 ? "year" : "years")}
                </span>
              </div>
            </div>
          </div>

          {/* Weekly - Days of week */}
          {customRule.frequency === "weekly" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Repeat on</Label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {WEEKDAY_SHORT.map((day, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={
                      customRule.byWeekDay?.includes(index) ? true : false
                    }
                    onClick={() => handleWeekdayToggle(index)}
                    className={`${
                      customRule.byWeekDay?.includes(index)
                        ? "bg-primary/90 text-primary-foreground border-primary"
                        : ""
                    } h-8 p-0 text-xs w-full`}
                  >
                    {day}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly - Day of month */}
          {customRule.frequency === "monthly" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Day of month</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={customRule.byMonthDay?.[0] || ""}
                onChange={(e) => {
                  const day = parseInt(e.target.value);
                  handleCustomRuleUpdate({
                    byMonthDay:
                      day && day >= 1 && day <= 31 ? [day] : undefined,
                  });
                }}
                placeholder="e.g., 15 for the 15th of each month"
                className="w-full"
              />
            </div>
          )}

          {/* Yearly - Month and day */}
          {customRule.frequency === "yearly" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Month</Label>
                <Select
                  value={customRule.byMonth?.[0]?.toString() || ""}
                  onValueChange={(value) =>
                    handleCustomRuleUpdate({
                      byMonth: value ? [parseInt(value)] : undefined,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {new Date(2024, i, 1).toLocaleDateString("default", {
                          month: "long",
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={customRule.byMonthDay?.[0] || ""}
                  onChange={(e) => {
                    const day = parseInt(e.target.value);
                    handleCustomRuleUpdate({
                      byMonthDay:
                        day && day >= 1 && day <= 31 ? [day] : undefined,
                    });
                  }}
                  placeholder="Day"
                />
              </div>
            </div>
          )}

          {/* End condition */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">End condition</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={!customRule.until && !customRule.count}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleCustomRuleUpdate({
                        until: undefined,
                        count: undefined,
                      });
                    }
                  }}
                />
                <Label className="text-sm cursor-pointer">
                  Never (no end date)
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={!!customRule.until}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleCustomRuleUpdate({ count: undefined });
                      setEndDateOpen(true);
                    } else {
                      handleCustomRuleUpdate({ until: undefined });
                    }
                  }}
                />
                <Label className="text-sm cursor-pointer">On date</Label>
                {customRule.until && (
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-2 h-8 px-2 text-xs"
                      >
                        {format(new Date(customRule.until), "MMM d, yyyy")}
                        <CalendarIcon className="ml-1 h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarUI
                        mode="single"
                        selected={new Date(customRule.until)}
                        onSelect={handleEndDateSet}
                        disabled={{ before: eventStartDate }}
                        className="rounded-md border"
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={!!customRule.count}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleCustomRuleUpdate({ until: undefined, count: 10 });
                    } else {
                      handleCustomRuleUpdate({ count: undefined });
                    }
                  }}
                />
                <Label className="text-sm cursor-pointer">After</Label>
                {customRule.count !== undefined && (
                  <div className="flex items-center gap-1 ml-2">
                    <Input
                      type="number"
                      min="1"
                      max="999"
                      value={customRule.count}
                      onChange={(e) =>
                        handleCountSet(parseInt(e.target.value) || undefined)
                      }
                      className="w-16 sm:w-20 h-8 px-2 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">
                      occurrences
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
