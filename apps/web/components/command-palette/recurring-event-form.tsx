"use client";

import { Input } from "@workspace/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/ui/select";
import { cn } from "@workspace/ui/lib/utils";
import { format } from "date-fns";
import type { RecurrenceRule, RecurrenceFrequency } from "@/lib/types/calendar";

import { chipClass, fieldClass } from "../event-editor/event-editor-styles";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

const WEEKDAYS = [
  { index: 1, short: "M", long: "Monday" },
  { index: 2, short: "T", long: "Tuesday" },
  { index: 3, short: "W", long: "Wednesday" },
  { index: 4, short: "T", long: "Thursday" },
  { index: 5, short: "F", long: "Friday" },
  { index: 6, short: "S", long: "Saturday" },
  { index: 0, short: "S", long: "Sunday" },
];

const UNIT_LABELS: Record<RecurrenceFrequency, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Date(2024, index, 1).toLocaleDateString("default", { month: "long" }),
);

function parseBounded(value: string, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, parsed));
}

function WeekdayPicker({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {WEEKDAYS.map((day) => {
        const active = selected.includes(day.index);
        return (
          <SimpleTooltip content={day.long} key={day.index}>
            <button
              type="button"
              aria-pressed={active}
              aria-label={day.long}
              onClick={() => onToggle(day.index)}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent/60 text-foreground hover:bg-accent",
              )}
            >
              {day.short}
            </button>
          </SimpleTooltip>
        );
      })}
    </div>
  );
}

function RepeatEnds({
  rule,
  onChange,
}: {
  rule: RecurrenceRule;
  onChange: (updates: Partial<RecurrenceRule>) => void;
}) {
  const mode = rule.count ? "after" : rule.until ? "until" : "never";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 text-sm text-muted-foreground">Ends</span>
      <Select
        value={mode}
        onValueChange={(value) => {
          if (value === "after") {
            onChange({ count: 10, until: undefined });
          } else if (value === "never") {
            onChange({ count: undefined, until: undefined });
          }
        }}
      >
        <SelectTrigger aria-label="Ends" className={cn(chipClass(true), "w-auto")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="never">Never</SelectItem>
          <SelectItem value="after">After</SelectItem>
          {rule.until && (
            <SelectItem value="until">
              On {format(new Date(rule.until), "MMM d, yyyy")}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {mode === "after" && (
        <>
          <Input
            type="number"
            min={1}
            max={999}
            aria-label="Number of occurrences"
            value={rule.count}
            onChange={(event) =>
              onChange({ count: parseBounded(event.target.value, 1, 999) })
            }
            className={cn(fieldClass(true), "h-8 w-16 px-2")}
          />
          <span className="text-sm text-muted-foreground">
            {rule.count === 1 ? "time" : "times"}
          </span>
        </>
      )}
    </div>
  );
}

export function RecurringEventForm({
  rule,
  onChange,
}: {
  rule: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
}) {
  const update = (updates: Partial<RecurrenceRule>) =>
    onChange({ ...rule, ...updates });
  const selectedWeekdays = rule.byWeekDay ?? [];

  return (
    <div className="space-y-1.5 pt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-12 text-sm text-muted-foreground">Every</span>
        <Input
          type="number"
          min={1}
          max={99}
          aria-label="Repeat interval"
          value={rule.interval}
          onChange={(event) =>
            update({ interval: parseBounded(event.target.value, 1, 99) })
          }
          className={cn(fieldClass(true), "h-8 w-14 px-2")}
        />
        <Select
          value={rule.frequency}
          onValueChange={(value: RecurrenceFrequency) =>
            update({
              frequency: value,
              byWeekDay: undefined,
              byMonthDay: undefined,
              byMonth: undefined,
            })
          }
        >
          <SelectTrigger
            aria-label="Repeat unit"
            className={cn(chipClass(true), "w-auto")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(UNIT_LABELS) as RecurrenceFrequency[]).map(
              (frequency) => (
                <SelectItem key={frequency} value={frequency}>
                  {UNIT_LABELS[frequency][rule.interval === 1 ? 0 : 1]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      {rule.frequency === "weekly" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-sm text-muted-foreground">On</span>
          <WeekdayPicker
            selected={selectedWeekdays}
            onToggle={(day) => {
              const next = selectedWeekdays.includes(day)
                ? selectedWeekdays.filter((value) => value !== day)
                : [...selectedWeekdays, day].sort();
              update({ byWeekDay: next.length > 0 ? next : undefined });
            }}
          />
        </div>
      )}

      {(rule.frequency === "monthly" || rule.frequency === "yearly") && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-sm text-muted-foreground">On</span>
          {rule.frequency === "yearly" && (
            <Select
              value={rule.byMonth?.[0]?.toString() ?? ""}
              onValueChange={(value) =>
                update({ byMonth: value ? [Number(value)] : undefined })
              }
            >
              <SelectTrigger
                aria-label="Month"
                className={cn(chipClass(true), "w-auto")}
              >
                <SelectValue placeholder="Same month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={(index + 1).toString()}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            type="number"
            min={1}
            max={31}
            aria-label="Day of month"
            placeholder="Day"
            value={rule.byMonthDay?.[0] ?? ""}
            onChange={(event) =>
              update({
                byMonthDay: event.target.value
                  ? [parseBounded(event.target.value, 1, 31)]
                  : undefined,
              })
            }
            className={cn(fieldClass(true), "h-8 w-16 px-2")}
          />
          {rule.frequency === "monthly" && (
            <span className="text-sm text-muted-foreground">of the month</span>
          )}
        </div>
      )}

      <RepeatEnds rule={rule} onChange={update} />
    </div>
  );
}
