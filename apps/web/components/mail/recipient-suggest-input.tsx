"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  formatRecentContactForField,
  insertRecipientSuggestion,
  parseAddressList,
  type RecentContactEntry,
} from "@workspace/calendar-core";
import { Input } from "@workspace/ui/components/ui/input";
import { cn } from "@workspace/ui/lib/utils";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import { SenderAvatar } from "./mail-avatar";

const SUGGESTION_LIST_MAX_HEIGHT = 240;
const SUGGESTION_LIST_GAP = 4;
const SUGGESTION_LIST_Z_INDEX = 200;

function getActiveRecipientToken(value: string): string {
  const separatorIndex = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"));
  return separatorIndex >= 0
    ? value.slice(separatorIndex + 1).trim()
    : value.trim();
}

function getSuggestionListStyle(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - SUGGESTION_LIST_GAP;
  const spaceAbove = rect.top - SUGGESTION_LIST_GAP;
  const placeAbove =
    spaceBelow < SUGGESTION_LIST_MAX_HEIGHT / 2 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    SUGGESTION_LIST_MAX_HEIGHT,
    Math.max(120, placeAbove ? spaceAbove : spaceBelow),
  );

  return {
    position: "fixed",
    left: rect.left,
    width: rect.width,
    top: placeAbove
      ? rect.top - maxHeight - SUGGESTION_LIST_GAP
      : rect.bottom + SUGGESTION_LIST_GAP,
    maxHeight,
    zIndex: SUGGESTION_LIST_Z_INDEX,
  };
}

type RecipientSuggestionsListProps = {
  listboxId: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  suggestions: RecentContactEntry[];
  highlightedIndex: number;
  onSelect: (entry: RecentContactEntry) => void;
};

function RecipientSuggestionsList({
  listboxId,
  anchorRef,
  open,
  suggestions,
  highlightedIndex,
  onSelect,
}: RecipientSuggestionsListProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(null);
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current) {
        return;
      }
      setStyle(getSuggestionListStyle(anchorRef.current));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open, suggestions.length]);

  if (!open || !style || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      id={listboxId}
      role="listbox"
      style={style}
      className="overflow-y-auto overscroll-contain rounded-md border border-border/60 bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
    >
      {suggestions.map((entry, index) => {
        const label = entry.displayName?.trim() || entry.email;
        return (
          <button
            key={entry.email}
            type="button"
            role="option"
            aria-selected={index === highlightedIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(entry)}
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
    </div>,
    document.body,
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

  useEffect(() => {
    if (!showSuggestions) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) {
        return;
      }
      if (
        target instanceof Element &&
        document.getElementById(listboxId)?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [listboxId, showSuggestions]);

  const selectSuggestion = useCallback(
    (entry: RecentContactEntry) => {
      if (onSelectSuggestion) {
        onSelectSuggestion(entry);
        setOpen(false);
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
      window.setTimeout(() => setOpen(false), 120);
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
    <div ref={containerRef} className={cn("relative flex-1 min-w-0", className)}>
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

      <RecipientSuggestionsList
        listboxId={listboxId}
        anchorRef={containerRef}
        open={showSuggestions}
        suggestions={suggestions}
        highlightedIndex={highlightedIndex}
        onSelect={selectSuggestion}
      />
    </div>
  );
}
