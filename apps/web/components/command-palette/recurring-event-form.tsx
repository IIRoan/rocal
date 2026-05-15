"use client";

import React, { useState, useEffect } from "react";
import { Label } from "@workspace/ui/components/ui/label";
import { Input } from "@workspace/ui/components/ui/input";
import { Checkbox } from "@workspace/ui/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { RotateCcw } from "lucide-react";
import type { RecurrenceRule, RecurrenceFrequency } from "@/lib/types/calendar";

interface RecurringEventFormProps {
  isRecurring: boolean;
  onIsRecurringChange: (isRecurring: boolean) => void;
  recurrenceRule: RecurrenceRule | null;
  onRecurrenceRuleChange: (rule: RecurrenceRule | null) => void;
  eventStartDate: Date;
  eventEndDate: Date;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2024, i, 1).toLocaleDateString("en-US", { month: "long" }),
);

function useRecurringFormState(
  isRecurring: boolean,
  recurrenceRule: RecurrenceRule | null,
  onRecurrenceRuleChange: (rule: RecurrenceRule | null) => void,
) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customRule, setCustomRule] = useState<RecurrenceRule>({
    frequency: "weekly",
    interval: 1,
  });

  useEffect(() => {
    if (isRecurring && !recurrenceRule) {
      onRecurrenceRuleChange(customRule);
    }
  }, [isRecurring, recurrenceRule, customRule, onRecurrenceRuleChange]);

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
    handleCustomRuleUpdate({ byWeekDay: newDays.length > 0 ? newDays : undefined });
  };

  const handleCountSet = (count: number | undefined) => {
    handleCustomRuleUpdate({ count, until: undefined });
  };

  return {
    showAdvanced, setShowAdvanced,
    customRule,
    handleCustomRuleUpdate, handleWeekdayToggle, handleCountSet,
  };
}

export function RecurringEventForm({
  isRecurring,
  onIsRecurringChange,
  recurrenceRule,
  onRecurrenceRuleChange,
  eventStartDate: _eventStartDate,
  eventEndDate: _eventEndDate,
}: RecurringEventFormProps) {
  const {
    showAdvanced, setShowAdvanced,
    customRule,
    handleCustomRuleUpdate, handleWeekdayToggle, handleCountSet,
  } = useRecurringFormState(isRecurring, recurrenceRule, onRecurrenceRuleChange);

  if (!isRecurring) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
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
            <RotateCcw className="size-4 text-muted-foreground" />
            Make this a recurring event
          </Label>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
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
          <SelectTrigger className="w-[110px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>

        {customRule.interval === 1 ? (
          <span className="text-sm text-muted-foreground">
            {customRule.frequency === "daily" && "every day"}
            {customRule.frequency === "weekly" && "every week"}
            {customRule.frequency === "monthly" && "every month"}
            {customRule.frequency === "yearly" && "every year"}
          </span>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">every</span>
            <Input
              type="number"
              min="2"
              max="99"
              value={customRule.interval}
              onChange={(e) =>
                handleCustomRuleUpdate({
                  interval: parseInt(e.target.value) || 2,
                })
              }
              className="w-16 h-9"
            />
            <span className="text-sm text-muted-foreground">
              {customRule.frequency === "daily" && "days"}
              {customRule.frequency === "weekly" && "weeks"}
              {customRule.frequency === "monthly" && "months"}
              {customRule.frequency === "yearly" && "years"}
            </span>
          </>
        )}
      </div>

      {customRule.frequency === "weekly" && (
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">on</span>
          {WEEKDAY_SHORT.map((day, index) => (
            <button
              key={day}
              type="button"
              onClick={() => handleWeekdayToggle(index)}
              className={`inline-flex items-center justify-center size-7 text-xs rounded-md transition-colors ${
                customRule.byWeekDay?.includes(index)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {day.slice(0, 1)}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">ends</span>
        <Select
          value={customRule.count ? "after" : "never"}
          onValueChange={(value) => {
            if (value === "never") {
              handleCustomRuleUpdate({ until: undefined, count: undefined });
            } else {
              handleCustomRuleUpdate({ until: undefined, count: 10 });
            }
          }}
        >
          <SelectTrigger className="w-[100px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="never">never</SelectItem>
            <SelectItem value="after">after</SelectItem>
          </SelectContent>
        </Select>

        {customRule.count !== undefined && (
          <>
            <Input
              type="number"
              min="1"
              max="999"
              value={customRule.count}
              onChange={(e) =>
                handleCountSet(parseInt(e.target.value) || undefined)
              }
              className="w-16 h-9"
            />
            <span className="text-sm text-muted-foreground">times</span>
          </>
        )}
      </div>

      {!showAdvanced && (
        <button
          type="button"
          onClick={() => setShowAdvanced(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          More options…
        </button>
      )}

      {showAdvanced && (
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Repeat every</Label>
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
              className="w-16 h-9"
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

          {customRule.frequency === "monthly" && (
            <div className="flex items-center gap-2">
              <Label className="text-sm">On day</Label>
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
                placeholder="15"
                className="w-16 h-9"
              />
              <span className="text-sm text-muted-foreground">
                of the month
              </span>
            </div>
          )}

          {customRule.frequency === "yearly" && (
            <div className="flex items-center gap-2">
              <Label className="text-sm">On</Label>
              <Select
                value={customRule.byMonth?.[0]?.toString() || ""}
                onValueChange={(value) =>
                  handleCustomRuleUpdate({
                    byMonth: value ? [parseInt(value)] : undefined,
                  })
                }
              >
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                className="w-16 h-9"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Hide options
          </button>
        </div>
      )}
    </div>
  );
}
