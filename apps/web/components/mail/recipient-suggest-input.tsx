"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  formatRecentContactForField,
  insertRecipientSuggestion,
  parseAddressList,
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
  onSelect: (entry: RecentContactEntry) => void;
};

function RecipientSuggestionsList({
  listboxId,
  suggestions,
  highlightedIndex,
  onSelect,
}: RecipientSuggestionsListProps) {
  return (
    <div id={listboxId} role="listbox" className="max-h-60 overflow-y-auto overscroll-contain">
      {suggestions.map((entry, index) => {
        const label = entry.displayName?.trim() || entry.email;
        return (
          <button
            key={entry.email}
            type="button"
            role="option"
            aria-selected={index === highlightedIndex}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(entry);
            }}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors",
              index === highlightedIndex ? "bg-muted/60" : "hover:bg-muted/40",
            )}
          >
            <SenderAvatar
              name={label}
              email={entry.email}
              className="size-7"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">{label}</span>
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
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const activeToken = getActiveRecipientToken(value);
  const excludeEmails = useMemo(
    () => parseAddressList(value).map((address) => address.email),
    [value],
  );

  const { suggestions, isAvailable } = useRecentContacts({
    query: activeToken,
    excludeEmails,
    limit: 8,
  });

  const showSuggestions = open && isAvailable && suggestions.length > 0;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [activeToken, suggestions.length]);

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
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        setOpen(true);
      } else {
        onKeyDown?.(event);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        current + 1 >= suggestions.length ? 0 : current + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        current - 1 < 0 ? suggestions.length - 1 : current - 1,
      );
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
    onFocus: () => setOpen(true),
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
        className="w-[var(--radix-popover-anchor-width)] p-0"
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
        <RecipientSuggestionsList
          listboxId={listboxId}
          suggestions={suggestions}
          highlightedIndex={highlightedIndex}
          onSelect={selectSuggestion}
        />
      </PopoverContent>
    </Popover>
  );
}
