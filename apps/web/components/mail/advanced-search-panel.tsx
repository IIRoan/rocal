"use client";

import { useId, useRef, useState } from "react";
import {
  Check,
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
  filtersToChips,
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

/** Drops `field` where it equals `value`, then any condition left without an active value. */
function removeConditionField(
  conditions: MailSearchFilterCondition[],
  field: keyof MailSearchFilterCondition,
  value: string | boolean,
): MailSearchFilterCondition[] {
  return conditions.flatMap((condition) => {
    const next = { ...condition };
    if (next[field] === value) delete next[field];
    const active = Object.values(next).some(
      (entry) => entry !== undefined && entry !== false && entry !== "",
    );
    return active ? [next] : [];
  });
}

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
  const [valueMissing, setValueMissing] = useState(false);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const valueErrorId = useId();

  const chips = filtersToChips(filters);
  const activeFieldMeta =
    ADDABLE_FIELDS.find((field) => field.field === activeField) ?? ADDABLE_FIELDS[0];

  const activeBooleanFields = new Set<keyof MailSearchFilterCondition>(
    QUICK_BOOLEAN_FIELDS.flatMap((field) =>
      filters.conditions.some((condition) => condition[field.field] === true)
        ? [field.field]
        : [],
    ),
  );

  const addDraftCondition = () => {
    if (!activeFieldMeta) return;
    if (!draftValue.trim()) {
      setValueMissing(true);
      valueInputRef.current?.focus();
      return;
    }
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
        conditions: removeConditionField(filters.conditions, field, true),
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
      conditions: removeConditionField(filters.conditions, chip.field, chip.value),
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
                  aria-pressed={isActive}
                  onClick={() => toggleBooleanFilter(field.field)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    isActive
                      ? "border-accent/30 bg-accent/15 text-accent"
                      : "border-border/50 bg-background/60 text-muted-foreground hover:bg-hover/50 hover:text-foreground",
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
                setValueMissing(false);
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
              ref={valueInputRef}
              type={activeFieldMeta?.type === "date" ? "date" : "text"}
              value={draftValue}
              aria-label={activeFieldMeta?.label}
              aria-invalid={valueMissing || undefined}
              aria-describedby={valueMissing ? valueErrorId : undefined}
              onChange={(event) => {
                setDraftValue(event.target.value);
                setValueMissing(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDraftCondition();
                }
              }}
              placeholder={activeFieldMeta?.placeholder}
              className="h-7 min-w-0 flex-1 border-border/50 bg-background text-xs shadow-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px]"
              onClick={addDraftCondition}
            >
              Add
            </Button>
          </div>
          {valueMissing ? (
            <p id={valueErrorId} className="text-[11px] text-destructive">
              Enter a value to filter by.
            </p>
          ) : null}
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {chips.map((chip, index) => (
            <span
              key={`${chip.field}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => removeChip(chip)}
                className="rounded-sm p-0.5 transition-colors hover:bg-accent/20"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="size-2.5" strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
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
      aria-label={activeCount > 0 ? `Filter, ${activeCount} active` : "Filter"}
    >
      <Filter className="size-3 shrink-0 opacity-70" strokeWidth={2.25} />
      <span className="hidden sm:inline">Filter</span>
      {activeCount > 0 ? (
        <span className="rounded bg-accent/15 px-1 py-px text-[11px] font-semibold tabular-nums text-accent">
          {activeCount}
        </span>
      ) : null}
      <ChevronDown
        className={cn(
          "size-3 shrink-0 opacity-50 transition-transform duration-200 motion-reduce:transition-none",
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
    active ? "text-accent" : "text-muted-foreground",
  );
  // The check is the non-color cue that the filter is on.
  if (active) return <Check className={className} strokeWidth={2.5} />;
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
