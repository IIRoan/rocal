"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  X,
  Paperclip,
  Star,
  MailOpen,
  SlidersHorizontal,
} from "lucide-react";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import { MOTION_EASING, revealSequence, slideFadeOut } from "@workspace/ui/lib/motion";
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
  value: MailSearchChip["value"],
): MailSearchFilterCondition[] {
  return conditions.flatMap((condition) => {
    const next = { ...condition };
    if (next[field] === value) delete next[field];
    const active = Object.entries(next).some(
      ([key, entry]) =>
        key !== "negated" && entry !== undefined && entry !== false && entry !== "",
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
  const panelRef = useRef<HTMLDivElement>(null);
  // The rows stay mounted while they slide away, so closing animates before the header shrinks.
  const [rowsShown, setRowsShown] = useState(expanded);
  if (expanded && !rowsShown) setRowsShown(true);

  // Opening the filters slides their rows down out of the search bar, one after the other, once painted.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!expanded || !panel) return;
    return revealSequence(panel, [
      { selector: "[data-filter-row]", offset: { y: -8 }, duration: 240, stagger: 50, easing: MOTION_EASING.soft },
    ]);
  }, [expanded]);

  // Closing slides them back up into the search bar together, then lets them go.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (expanded || !rowsShown || !panel) return;
    const rows = Array.from(panel.querySelectorAll<HTMLElement>("[data-filter-row]")).reverse();
    const exits = rows.flatMap((row) => slideFadeOut(row, { y: -8 }, { duration: 160 }) ?? []);
    let cancelled = false;
    Promise.all(exits.map((exit) => exit.finished))
      .then(() => {
        if (!cancelled) setRowsShown(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      for (const exit of exits) exit.cancel();
    };
  }, [expanded, rowsShown]);

  const chipCounts = new Map<string, number>();
  // Repeated conditions give identical chips, so the key counts earlier repeats instead of using the index.
  const chips = filtersToChips(filters).map((chip) => {
    const value = `${chip.field}:${chip.label}`;
    const seen = chipCounts.get(value) ?? 0;
    chipCounts.set(value, seen + 1);
    return { ...chip, key: `${seen}:${value}` };
  });
  const activeFieldMeta =
    ADDABLE_FIELDS.find((field) => field.field === activeField) ?? ADDABLE_FIELDS[0];

  const activeBooleanFields = new Set<keyof MailSearchFilterCondition>(
    QUICK_BOOLEAN_FIELDS.flatMap((field) =>
      filters.conditions.some(
        (condition) => condition[field.field] === true && !condition.negated,
      )
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

  if (!rowsShown && chips.length === 0) return null;
  return (
    <div ref={panelRef} className={cn("flex min-w-0 flex-col gap-2", className)}>
      {rowsShown ? (
        <>
          <div data-filter-row className="flex flex-wrap gap-1">
            {QUICK_BOOLEAN_FIELDS.map((field) => {
              const isActive = activeBooleanFields.has(field.field);
              return (
                <button
                  key={field.field}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => toggleBooleanFilter(field.field)}
                  className={cn(
                    "inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs transition-colors",
                    isActive
                      ? "bg-accent/15 font-medium text-accent"
                      : "bg-[var(--bg-overlay-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <QuickFilterIcon field={field.field} active={isActive} />
                  {field.label}
                </button>
              );
            })}
          </div>

          {/* One field box: what to match on, the value, and Add. */}
          <div
            data-field
            data-filter-row
            className="flex h-8 min-w-0 items-center rounded-lg bg-[var(--bg-overlay-tertiary)] pr-1 pl-1"
          >
            <select
              value={activeField}
              onChange={(event) => {
                setActiveField(event.target.value as keyof MailSearchFilterCondition);
                setDraftValue("");
                setValueMissing(false);
              }}
              className="h-7 shrink-0 cursor-pointer rounded-md border-0 bg-transparent px-1.5 text-xs text-[var(--text-primary)]"
              aria-label="Filter field"
            >
              {ADDABLE_FIELDS.map((field) => (
                <option key={field.field} value={field.field}>
                  {field.label}
                </option>
              ))}
            </select>
            <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-[var(--border-secondary)]" />
            <input
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
              className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-tertiary)]"
            />
            <button
              type="button"
              onClick={addDraftCondition}
              className="h-6 shrink-0 cursor-pointer rounded-md px-2 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
            >
              Add
            </button>
          </div>
          {valueMissing ? (
            <p id={valueErrorId} className="text-[11px] text-destructive">
              Enter a value to filter by.
            </p>
          ) : null}
        </>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-[26px] items-center gap-0.5 rounded-full bg-accent/15 pr-1 pl-2.5 text-xs font-medium text-accent"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => removeChip(chip)}
                className="flex size-5 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-accent/20"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X aria-hidden className="size-3" strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 cursor-pointer text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
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
    <SimpleTooltip content="Filters">
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        className={cn(
          "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs text-[var(--text-secondary)] transition-colors",
          "hover:bg-[var(--bg-overlay-secondary)] hover:text-[var(--text-primary)]",
          expanded && "bg-[var(--bg-overlay-secondary)] text-[var(--text-primary)]",
          className,
        )}
        aria-expanded={expanded}
        aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : "Filters"}
      >
        <SlidersHorizontal aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
        {activeCount > 0 ? (
          <span className="rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold tabular-nums text-accent">
            {activeCount}
          </span>
        ) : null}
      </button>
    </SimpleTooltip>
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
