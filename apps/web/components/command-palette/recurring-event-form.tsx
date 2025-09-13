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
  Eye, 
  ChevronDown,
  ChevronUp,
  Loader2,
  X
} from "lucide-react";
import { toast } from "sonner";
import { calendarApiService } from "@/lib/calendar-api-service";
import type { 
  RecurrenceRule, 
  RecurrenceFrequency,
  RecurrencePreview,
  RecurrencePatterns
} from "@/lib/types/calendar";

interface RecurringEventFormProps {
  isRecurring: boolean;
  onIsRecurringChange: (isRecurring: boolean) => void;
  recurrenceRule: RecurrenceRule | null;
  onRecurrenceRuleChange: (rule: RecurrenceRule | null) => void;
  eventStartDate: Date;
  eventEndDate: Date;
}

const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
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
  const [preview, setPreview] = useState<RecurrencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [patterns, setPatterns] = useState<RecurrencePatterns>({});
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [customRule, setCustomRule] = useState<RecurrenceRule>({
    frequency: "weekly",
    interval: 1,
  });
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Load common patterns on mount
  useEffect(() => {
    const loadPatterns = async () => {
      setPatternsLoading(true);
      try {
        const patternsData = await calendarApiService.getRecurrencePatterns();
        setPatterns(patternsData);
      } catch (error) {
        console.error("Failed to load recurrence patterns:", error);
        toast.error("Failed to load recurrence options");
      } finally {
        setPatternsLoading(false);
      }
    };

    loadPatterns();
  }, []);

  // Initialize custom rule when recurring is enabled
  useEffect(() => {
    if (isRecurring && !recurrenceRule) {
      onRecurrenceRuleChange(customRule);
    }
  }, [isRecurring, recurrenceRule, customRule, onRecurrenceRuleChange]);

  // Generate preview when rule changes
  useEffect(() => {
    if (isRecurring && recurrenceRule) {
      generatePreview();
    } else {
      setPreview(null);
    }
  }, [isRecurring, recurrenceRule, eventStartDate, eventEndDate]);

  const generatePreview = async () => {
    if (!recurrenceRule) return;

    // Expand preview window based on frequency/interval so we show multiple
    // upcoming instances (esp. monthly/yearly).
    const desiredOccurrences = 6; // aim to fetch at least ~6
    const interval = Math.max(1, recurrenceRule.interval || 1);
    const unitDays =
      recurrenceRule.frequency === "daily"
        ? 1
        : recurrenceRule.frequency === "weekly"
          ? 7
          : recurrenceRule.frequency === "monthly"
            ? 30
            : 365; // yearly
    let previewDays = interval * desiredOccurrences * unitDays + (unitDays >= 30 ? 30 : 7);
    // Minimum sensible windows
    if (recurrenceRule.frequency === "daily") previewDays = Math.max(previewDays, 45);
    if (recurrenceRule.frequency === "weekly") previewDays = Math.max(previewDays, 90);
    if (recurrenceRule.frequency === "monthly") previewDays = Math.max(previewDays, 365);
    if (recurrenceRule.frequency === "yearly") previewDays = Math.max(previewDays, 365 * 6);

    // Respect backend constraints (previewDays <= 365)
    previewDays = Math.min(Math.max(7, previewDays), 365);
    setPreviewLoading(true);
    try {
      let previewData = await calendarApiService.previewRecurrence(
        eventStartDate.toISOString(),
        eventEndDate.toISOString(),
        recurrenceRule,
        previewDays
      );
      // Frontend fallback: ensure multiple visible occurrences for long intervals
      try {
        const freq = recurrenceRule.frequency;
        const interval = Math.max(1, recurrenceRule.interval || 1);
        const instances = previewData.instances ?? [];
        const needed = Math.max(0, 5 - instances.length);
        const until = recurrenceRule.until ? new Date(recurrenceRule.until) : null;
        const count = typeof recurrenceRule.count === 'number' ? recurrenceRule.count : undefined;

        if ((freq === 'yearly' || freq === 'monthly') && needed > 0) {
          const extra: { date: string; isOriginal: boolean }[] = [];
          const anchor = new Date(eventStartDate);
          // Start from last preview instance if any (safe check for undefined)
          const lastInstance = instances.length ? instances[instances.length - 1] : undefined;
          let cursor = lastInstance ? new Date(lastInstance.date) : anchor;
          const addMonths = (d: Date, m: number) => {
            const nd = new Date(d);
            const day = nd.getDate();
            nd.setDate(1);
            nd.setMonth(nd.getMonth() + m);
            const maxDay = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
            nd.setDate(Math.min(day, maxDay));
            return nd;
          };
          const addYears = (d: Date, y: number) => addMonths(d, y * 12);
          const step = freq === 'monthly' ? (d: Date) => addMonths(d, interval) : (d: Date) => addYears(d, interval);

          let produced = 0;
          // Determine how many already counted
          let already = instances.length;
          while (produced < needed && (!count || already + produced < count)) {
            cursor = step(cursor);
            if (until && cursor > until) break;
            extra.push({ date: cursor.toISOString(), isOriginal: false });
            produced += 1;
          }
          if (extra.length) {
            const merged = [...instances, ...extra];
            previewData = {
              ...previewData,
              instances: merged,
              totalInstances: Math.max(previewData.totalInstances || 0, merged.length),
            };
          }
        }
      } catch {}
      setPreview(previewData);
    } catch (error) {
      console.error("Failed to generate preview:", error);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

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
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    
    handleCustomRuleUpdate({ byWeekDay: newDays.length > 0 ? newDays : undefined });
  };

  const handleEndDateSet = (date: Date | undefined) => {
    if (date) {
      handleCustomRuleUpdate({ 
        until: date.toISOString(),
        count: undefined // Clear count if setting until date
      });
      setEndDateOpen(false);
    }
  };

  const handleCountSet = (count: number | undefined) => {
    handleCustomRuleUpdate({ 
      count,
      until: undefined // Clear until if setting count
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
          <Label htmlFor="recurring" className="text-sm font-medium cursor-pointer flex items-center gap-2">
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
          <Label htmlFor="recurring" className="text-sm font-medium cursor-pointer flex items-center gap-2">
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
                <span className="text-sm text-muted-foreground">Loading patterns...</span>
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
                    JSON.stringify(pattern.rule) === JSON.stringify(recurrenceRule)
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm">{pattern.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {pattern.rule.frequency.charAt(0).toUpperCase() + pattern.rule.frequency.slice(1)}
                      {pattern.rule.interval > 1 && ` (Every ${pattern.rule.interval})`}
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
                  handleCustomRuleUpdate({ frequency: value, byWeekDay: undefined, byMonthDay: undefined, byMonth: undefined })
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
                  onChange={(e) => handleCustomRuleUpdate({ interval: parseInt(e.target.value) || 1 })}
                  className="w-20 sm:w-24"
                />
                <span className="text-sm text-muted-foreground">
                  {customRule.frequency === "daily" && (customRule.interval === 1 ? "day" : "days")}
                  {customRule.frequency === "weekly" && (customRule.interval === 1 ? "week" : "weeks")}
                  {customRule.frequency === "monthly" && (customRule.interval === 1 ? "month" : "months")}
                  {customRule.frequency === "yearly" && (customRule.interval === 1 ? "year" : "years")}
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
                    aria-pressed={customRule.byWeekDay?.includes(index) ? true : false}
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
                    byMonthDay: day && day >= 1 && day <= 31 ? [day] : undefined 
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
                    handleCustomRuleUpdate({ byMonth: value ? [parseInt(value)] : undefined })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {new Date(2024, i, 1).toLocaleDateString('default', { month: 'long' })}
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
                      byMonthDay: day && day >= 1 && day <= 31 ? [day] : undefined 
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
                      handleCustomRuleUpdate({ until: undefined, count: undefined });
                    }
                  }}
                />
                <Label className="text-sm cursor-pointer">Never (no end date)</Label>
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
                      onChange={(e) => handleCountSet(parseInt(e.target.value) || undefined)}
                      className="w-16 sm:w-20 h-8 px-2 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">occurrences</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="border-t border-border pt-3 mt-3">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Preview</Label>
            {previewLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{preview.description}</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Next 5 occurrences</p>
            </div>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {preview.instances.slice(0, 5).map((instance, index) => (
                <li
                  key={index}
                  className="text-xs rounded-md border border-border bg-muted px-3 py-2 text-foreground flex items-center justify-between"
                >
                  <span>{format(new Date(instance.date), "EEE, MMM d, yyyy")}</span>
                  {instance.isOriginal && (
                    <span className="ml-2 inline-flex items-center rounded border border-border/50 px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                      original
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
