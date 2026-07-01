"use client";

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  formatRecentContactForField,
  getContactDisplayLabel,
  insertRecipientSuggestion,
  normalizeEmailAddress,
  parseAddressList,
  filterContactsList,
  filterRecentContactSuggestions,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import { Input } from "@workspace/ui/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@workspace/ui/components/ui/popover";
import { cn } from "@workspace/ui/lib/utils";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import { SenderAvatar } from "./mail-avatar";

function getActiveRecipientToken(value: string): string {
  const separatorIndex = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  return separatorIndex >= 0
    ? value.slice(separatorIndex + 1).trim()
    : value.trim();
}

type RecipientSuggestionsListProps = {
  listboxId: string;
  suggestions: RecentContactEntry[];
  highlightedIndex: number;
  heading: string;
  onSelect: (entry: RecentContactEntry) => void;
};

function RecipientSuggestionsList({
  listboxId,
  suggestions,
  highlightedIndex,
  heading,
  onSelect,
}: RecipientSuggestionsListProps) {
  const headingId = `${listboxId}-heading`;
  return (
    <div
      id={listboxId}
      aria-labelledby={headingId}
      className="max-h-64 overflow-y-auto overscroll-contain py-1"
    >
      <div
        id={headingId}
        className="px-2.5 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {heading}
      </div>
      {suggestions.map((entry, index) => {
        const label = getContactDisplayLabel(entry);
        return (
          <button
            key={entry.email}
            id={`${listboxId}-option-${index}`}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(entry);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm transition-colors",
              index === highlightedIndex ? "bg-accent/60" : "hover:bg-accent/40",
            )}
          >
            <SenderAvatar
              name={label}
              email={entry.email}
              className="size-7 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">
                {label}
              </span>
              {entry.displayName ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {entry.email}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type RecipientSuggestInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Bare inline input for mail compose rows; styled field for forms. */
  appearance?: "compose" | "field";
  mode?: "mail" | "calendar";
  onSelectSuggestion?: (entry: RecentContactEntry) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function RecipientSuggestInput({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  className,
  inputClassName,
  appearance = "compose",
  mode = "mail",
  onSelectSuggestion,
  onKeyDown,
}: RecipientSuggestInputProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [highlightState, setHighlightState] = useState({
    activeToken: "",
    suggestionsLength: 0,
    index: 0,
  });

  const activeToken = getActiveRecipientToken(value);
  const excludeEmails = useMemo(
    () =>
      new Set(
        parseAddressList(value).map((address) =>
          normalizeEmailAddress(address.email),
        ),
      ),
    [value],
  );

  const { payload, isAvailable, isLoading } = useRecentContacts();

  const suggestions = useMemo(() => {
    if (!payload) return [];

    const exclude = [...excludeEmails];
    const trimmedToken = activeToken.trim();

    if (!trimmedToken) {
      return filterRecentContactSuggestions(payload, {
        excludeEmails: exclude,
        limit: 10,
      });
    }

    const prefixMatches = filterRecentContactSuggestions(payload, {
      query: trimmedToken,
      excludeEmails: exclude,
      limit: 8,
    });
    if (prefixMatches.length > 0) {
      return prefixMatches;
    }

    return filterContactsList(payload, { query: trimmedToken })
      .filter((entry) => !excludeEmails.has(entry.email))
      .slice(0, 8);
  }, [activeToken, excludeEmails, payload]);

  const suggestionsHeading = activeToken.trim()
    ? "Matching contacts"
    : "Recent contacts";

  const showSuggestions =
    open &&
    isAvailable &&
    (isLoading || suggestions.length > 0 || activeToken.trim().length > 0);

  if (
    highlightState.activeToken !== activeToken ||
    highlightState.suggestionsLength !== suggestions.length
  ) {
    setHighlightState({
      activeToken,
      suggestionsLength: suggestions.length,
      index: 0,
    });
  }
  const highlightedIndex = highlightState.index;

  const selectSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      selectingRef.current = true;

      if (onSelectSuggestion) {
        onSelectSuggestion(entry);
        setOpen(false);
        queueMicrotask(() => {
          selectingRef.current = false;
        });
        return;
      }

      const formatted = formatRecentContactForField(entry);
      const nextValue =
        mode === "mail"
          ? insertRecipientSuggestion(value, formatted, {
              appendSeparator: true,
            })
          : formatted;

      onChange(nextValue);
      setOpen(false);
      queueMicrotask(() => {
        selectingRef.current = false;
      });
    },
    [mode, onChange, onSelectSuggestion, value],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        isAvailable &&
        (suggestions.length > 0 || isLoading)
      ) {
        event.preventDefault();
        setOpen(true);
        return;
      }
      onKeyDown?.(event);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightState((state) => ({
        ...state,
        index:
          state.index + 1 >= suggestions.length ? 0 : state.index + 1,
      }));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightState((state) => ({
        ...state,
        index:
          state.index - 1 < 0 ? suggestions.length - 1 : state.index - 1,
      }));
      return;
    }

    if (event.key === "Enter") {
      const selected = suggestions[highlightedIndex];
      if (selected) {
        event.preventDefault();
        selectSuggestion(selected);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    onKeyDown?.(event);
  };

  const sharedInputProps = {
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
      setOpen(true);
    },
    onFocus: () => {
      if (isAvailable) {
        setOpen(true);
      }
    },
    onBlur: () => {
      window.setTimeout(() => {
        if (!selectingRef.current) {
          setOpen(false);
        }
      }, 0);
      onBlur?.();
    },
    onKeyDown: handleKeyDown,
    placeholder,
    disabled,
    autoComplete: "off" as const,
    role: "combobox" as const,
    "aria-expanded": showSuggestions,
    "aria-controls": showSuggestions ? listboxId : undefined,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant":
      showSuggestions && suggestions.length > 0
        ? `${listboxId}-option-${highlightedIndex}`
        : undefined,
  };

  return (
    <Popover
      open={showSuggestions}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setOpen(false);
        }
      }}
    >
      <PopoverAnchor asChild>
        <div
          ref={containerRef}
          className={cn("relative flex-1 min-w-0", className)}
        >
          {appearance === "field" ? (
            <Input {...sharedInputProps} className={inputClassName} />
          ) : (
            <input
              type="text"
              {...sharedInputProps}
              className={cn(
                "w-full h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40",
                inputClassName,
              )}
            />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-anchor-width)] min-w-[16rem] max-w-[min(24rem,calc(100dvw-2rem))] p-0 border-border/60 shadow-lg"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (containerRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
      >
        {isLoading ? (
          <div className="px-3 py-2.5 text-xs text-muted-foreground">
            Loading contacts…
          </div>
        ) : suggestions.length === 0 ? (
          <div className="px-3 py-2.5 text-xs text-muted-foreground">
            No matching contacts
          </div>
        ) : (
          <RecipientSuggestionsList
            listboxId={listboxId}
            suggestions={suggestions}
            highlightedIndex={highlightedIndex}
            heading={suggestionsHeading}
            onSelect={selectSuggestion}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
