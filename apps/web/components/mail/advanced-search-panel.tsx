"use client";

import { useMemo, useState } from "react";
import {
  X,
  Paperclip,
  Star,
  MailOpen,
  Filter,
  ChevronDown,
} from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { cn } from "@workspace/ui/lib/utils";
import {
  SEARCH_FILTER_FIELDS,
  conditionToChip,
  type MailSearchFilters,
  type MailSearchFilterCondition,
  type MailSearchChip,
} from "@/lib/mail/mail-search-filter";

interface AdvancedSearchPanelProps {
  filters: MailSearchFilters;
  onFiltersChange: (filters: MailSearchFilters) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}

const ADDABLE_FIELDS = SEARCH_FILTER_FIELDS.filter((f) => f.type !== "boolean");
const QUICK_BOOLEAN_FIELDS = SEARCH_FILTER_FIELDS.filter((f) => f.type === "boolean");

export function AdvancedSearchPanel({
  filters,
  onFiltersChange,
  expanded,
  onExpandedChange,
  className,
}: AdvancedSearchPanelProps) {
  const [activeField, setActiveField] =
    useState<keyof MailSearchFilterCondition>("from");
  const [draftValue, setDraftValue] = useState("");

  const chips = filtersToChipsWithText(filters);
  const activeFieldMeta =
    ADDABLE_FIELDS.find((field) => field.field === activeField) ?? ADDABLE_FIELDS[0];

  const activeBooleanFields = useMemo(() => {
    const set = new Set<keyof MailSearchFilterCondition>();
    for (const condition of filters.conditions) {
      for (const field of QUICK_BOOLEAN_FIELDS) {
        if (condition[field.field] === true) {
          set.add(field.field);
        }
      }
    }
    return set;
  }, [filters.conditions]);

  const addDraftCondition = () => {
    if (!activeFieldMeta || !draftValue.trim()) return;
    onFiltersChange({
      ...filters,
      conditions: [...filters.conditions, { [activeField]: draftValue.trim() }],
    });
    setDraftValue("");
  };

  const toggleBooleanFilter = (field: keyof MailSearchFilterCondition) => {
    if (activeBooleanFields.has(field)) {
      onFiltersChange({
        ...filters,
        conditions: filters.conditions
          .map((condition) => {
            if (condition[field] !== true) return condition;
            const next = { ...condition };
            delete next[field];
            return next;
          })
          .filter((condition) =>
            Object.values(condition).some(
              (value) => value !== undefined && value !== false && value !== "",
            ),
          ),
      });
      return;
    }

    onFiltersChange({
      ...filters,
      conditions: [...filters.conditions, { [field]: true }],
    });
  };

  const removeChip = (chip: MailSearchChip) => {
    if (chip.field === "subject" && chip.label === filters.text) {
      onFiltersChange({ ...filters, text: undefined });
      return;
    }
    onFiltersChange({
      ...filters,
      conditions: filters.conditions
        .map((condition) => {
          if (condition[chip.field] === chip.value) {
            const next = { ...condition };
            delete next[chip.field];
            return next;
          }
          return condition;
        })
        .filter((condition) =>
          Object.values(condition).some(
            (value) => value !== undefined && value !== false && value !== "",
          ),
        ),
    });
  };

  const clearAll = () => {
    onFiltersChange({ text: undefined, conditions: [] });
  };

  return (
    <div className={cn("min-w-0", className)}>
      {expanded ? (
        <div className="mt-1.5 space-y-1.5 rounded-md border border-border/50 bg-muted/25 p-2">
          <div className="flex flex-wrap gap-1">
            {QUICK_BOOLEAN_FIELDS.map((field) => {
              const isActive = activeBooleanFields.has(field.field);
              return (
                <button
                  key={field.field}
                  type="button"
                  onClick={() => toggleBooleanFilter(field.field)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/15 text-primary"
                      : "border-border/50 bg-background/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <QuickFilterIcon field={field.field} active={isActive} />
                  {field.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={activeField}
              onChange={(event) => {
                setActiveField(event.target.value as keyof MailSearchFilterCondition);
                setDraftValue("");
              }}
              className="h-7 shrink-0 rounded-md border border-border/50 bg-background px-1.5 text-[11px] text-foreground"
              aria-label="Filter field"
            >
              {ADDABLE_FIELDS.map((field) => (
                <option key={field.field} value={field.field}>
                  {field.label}
                </option>
              ))}
            </select>
            <Input
              type={activeFieldMeta?.type === "date" ? "date" : "text"}
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDraftCondition();
                }
              }}
              placeholder={activeFieldMeta?.placeholder}
              className="h-7 min-w-0 flex-1 border-border/50 bg-background text-xs shadow-none focus-visible:ring-1 focus-visible:ring-ring/40"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px]"
              onClick={addDraftCondition}
              disabled={!draftValue.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {chips.map((chip, index) => (
            <span
              key={`${chip.field}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => removeChip(chip)}
                className="rounded-sm p-0.5 transition-colors hover:bg-primary/20"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="size-2.5" strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdvancedSearchToggle({
  expanded,
  onExpandedChange,
  activeCount,
  className,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  activeCount: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onExpandedChange(!expanded)}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 text-[11px] font-medium text-muted-foreground shadow-none transition-colors",
        "hover:bg-muted/60 hover:text-foreground",
        expanded && "border-border bg-muted/70 text-foreground",
        className,
      )}
      aria-expanded={expanded}
      aria-label="Toggle filters"
    >
      <Filter className="size-3 shrink-0 opacity-70" strokeWidth={2.25} />
      <span className="hidden sm:inline">Filter</span>
      {activeCount > 0 ? (
        <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-semibold tabular-nums text-primary">
          {activeCount}
        </span>
      ) : null}
      <ChevronDown
        className={cn(
          "size-3 shrink-0 opacity-50 transition-transform duration-200",
          expanded && "rotate-180",
        )}
        strokeWidth={2.25}
      />
    </button>
  );
}

function QuickFilterIcon({
  field,
  active,
}: {
  field: keyof MailSearchFilterCondition;
  active: boolean;
}) {
  const className = cn(
    "size-3 shrink-0",
    active ? "text-primary" : "text-muted-foreground",
  );
  switch (field) {
    case "hasAttachment":
      return <Paperclip className={className} strokeWidth={2.25} />;
    case "isFlagged":
      return <Star className={className} strokeWidth={2.25} />;
    case "isUnread":
      return <MailOpen className={className} strokeWidth={2.25} />;
    default:
      return null;
  }
}

function filtersToChipsWithText(filters: MailSearchFilters): MailSearchChip[] {
  const chips: MailSearchChip[] = [];
  if (filters.text) {
    chips.push({ field: "subject", value: filters.text, label: filters.text });
  }
  for (const condition of filters.conditions) {
    chips.push(...conditionToChip(condition));
  }
  return chips;
}

export function countActiveFilters(filters: MailSearchFilters): number {
  return filtersToChipsWithText(filters).length;
}
