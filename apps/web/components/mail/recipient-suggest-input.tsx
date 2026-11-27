"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Lock, X } from "lucide-react";
import {
  formatRecentContactForField,
  getContactDisplayLabel,
  getEmailDomain,
  insertRecipientSuggestion,
  isValidEmailAddress,
  joinRecipientField,
  normalizeEmailAddress,
  parseAddressList,
  parseRecipientString,
  resolveRecipientSuggestions,
  splitRecipientField,
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
  internalDomain?: string | null;
  onSelect: (entry: RecentContactEntry) => void;
};

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-[var(--border-secondary,var(--border))] px-1 font-sans text-[10.5px] text-[var(--text-secondary,var(--muted-foreground))]">
      {children}
    </kbd>
  );
}

function RecipientChip({
  token,
  encrypted,
  onRemove,
}: {
  token: string;
  encrypted: boolean;
  onRemove: () => void;
}) {
  const { name, email } = parseRecipientString(token);
  const label = name || email;
  const invalid = !isValidEmailAddress(token);
  return (
    <span
      title={token}
      className={cn(
        "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full pl-1 pr-1 text-[13px]",
        invalid
          ? "bg-destructive/10 text-destructive"
          : "bg-[var(--bg-overlay-tertiary,var(--muted))] text-[var(--text-primary,var(--foreground))]",
      )}
    >
      <SenderAvatar name={label} email={email} className="size-5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
      {encrypted && !invalid ? (
        <Lock aria-hidden className="size-3 shrink-0 text-[var(--icon-tertiary,var(--muted-foreground))]" />
      ) : null}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Remove ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onRemove}
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--icon-tertiary,var(--muted-foreground))] hover:bg-[var(--bg-overlay-secondary,var(--hover))] hover:text-[var(--icon-primary,var(--foreground))]"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

function RecipientSuggestionsList({
  listboxId,
  suggestions,
  highlightedIndex,
  heading,
  internalDomain,
  onSelect,
}: RecipientSuggestionsListProps) {
  const headingId = `${listboxId}-heading`;
  const domain = internalDomain?.trim().toLowerCase();
  return (
    <div className="flex max-h-80 flex-col">
      <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1 text-xs font-medium text-[var(--text-tertiary,var(--muted-foreground))]">
        <span id={headingId}>{heading}</span>
        <span aria-hidden className="tabular-nums">
          {suggestions.length === 1 ? "1 contact" : `${suggestions.length} contacts`}
        </span>
      </div>
      <div id={listboxId} role="listbox" aria-labelledby={headingId} className="min-h-0 overflow-y-auto overscroll-contain">
        {suggestions.map((entry, index) => {
          const label = getContactDisplayLabel(entry);
          return (
            <button
              key={entry.email}
              id={`${listboxId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(entry);
              }}
              className={cn(
                "flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                index === highlightedIndex
                  ? "bg-[var(--bg-cell-hover,var(--hover))]"
                  : "hover:bg-[var(--bg-cell-hover,var(--hover))]",
              )}
            >
              <SenderAvatar
                name={label}
                email={entry.email}
                className="size-[30px] shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-[135%] text-[var(--text-primary,var(--foreground))]">
                  {label}
                </span>
                {entry.displayName ? (
                  <span className="block truncate text-xs leading-[135%] text-[var(--text-secondary,var(--muted-foreground))]">
                    {entry.email}
                  </span>
                ) : null}
              </span>
              {domain && getEmailDomain(entry.email) === domain ? (
                <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 text-[11px] font-medium text-accent">
                  <Lock className="size-2.5" aria-hidden />
                  Solace
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        aria-hidden
        className="mt-1 flex items-center gap-1.5 border-t border-[var(--border-tertiary,var(--border))] px-2.5 pt-2 pb-1 text-[11px] text-[var(--text-tertiary,var(--muted-foreground))]"
      >
        <Key>↑</Key>
        <Key>↓</Key>
        <span className="mr-2">to choose</span>
        <Key>↵</Key>
        <span className="mr-2">to add</span>
        <Key>Esc</Key>
        <span>to close</span>
      </div>
    </div>
  );
}

export type RecipientSuggestInputProps = {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  /** Bare inline input for mail compose rows; styled field for forms. */
  appearance?: "compose" | "field";
  mode?: "mail" | "calendar";
  /** Marks Solace contacts in suggestions; mail between them is end-to-end encrypted. */
  internalDomain?: string | null;
  /** The whole message will be end-to-end encrypted, so each recipient chip shows a lock. */
  encrypted?: boolean;
  onSelectSuggestion?: (entry: RecentContactEntry) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function RecipientSuggestInput({
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  autoFocus,
  className,
  inputClassName,
  appearance = "compose",
  mode = "mail",
  internalDomain,
  encrypted = false,
  onSelectSuggestion,
  onKeyDown,
}: RecipientSuggestInputProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  // Mail compose shows finished addresses as chips; the field value stays the same comma-separated text.
  const chips = appearance === "compose" && mode === "mail";
  const field = chips ? splitRecipientField(value) : { tokens: [], draft: value };
  // The same address can be typed twice, so repeats get a count to keep their keys apart.
  const seenTokens = new Map<string, number>();
  const chipKeys = field.tokens.map((token) => {
    const count = (seenTokens.get(token) ?? 0) + 1;
    seenTokens.set(token, count);
    return count > 1 ? `${token}#${count}` : token;
  });
  const selectingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [highlightState, setHighlightState] = useState({
    activeToken: "",
    suggestionsLength: 0,
    index: 0,
  });

  const activeToken = getActiveRecipientToken(value);
  const excludeEmails = new Set(
    parseAddressList(value).map((address) =>
      normalizeEmailAddress(address.email),
    ),
  );

  const { payload, isAvailable, isLoading } = useRecentContacts();

  const suggestions = resolveRecipientSuggestions(payload, {
    query: activeToken,
    excludeEmails: [...excludeEmails],
    limit: activeToken.trim() ? 8 : 10,
  });

  const suggestionsHeading = activeToken.trim()
    ? "Matching contacts"
    : "Recent contacts";

  const showSuggestions =
    open &&
    isAvailable &&
    (isLoading || suggestions.length > 0 || activeToken.trim().length > 0);
  const listboxVisible = showSuggestions && !isLoading && suggestions.length > 0;

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

  const selectSuggestion = (entry: RecentContactEntry) => {
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
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const lastToken = field.tokens.at(-1);
    // Backspace in an empty draft brings the last chip back as text to edit.
    if (event.key === "Backspace" && chips && !field.draft && lastToken) {
      event.preventDefault();
      onChange(joinRecipientField(field.tokens.slice(0, -1), lastToken));
      return;
    }
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
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    onKeyDown?.(event);
  };

  const sharedInputProps = {
    id,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    value: field.draft,
    autoFocus,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(chips ? joinRecipientField(field.tokens, event.target.value) : event.target.value);
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
      if (chips && field.draft.trim() && !selectingRef.current) {
        onChange(joinRecipientField([...field.tokens, field.draft.trim()], ""));
      }
      onBlur?.();
    },
    onKeyDown: handleKeyDown,
    placeholder: field.tokens.length > 0 ? undefined : placeholder,
    disabled,
    autoComplete: "off" as const,
    role: "combobox" as const,
    "aria-expanded": listboxVisible,
    "aria-controls": listboxVisible ? listboxId : undefined,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": listboxVisible
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
          // The chips and the input are one field, so its focus outline wraps them together.
          data-field={chips || undefined}
          className={cn(
            "relative flex-1 min-w-0",
            // Padding keeps the outline off the text; the matching negative margin keeps it aligned with the other rows.
            chips && "-ml-2 flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1.5",
            className,
          )}
        >
          {field.tokens.map((token, index) => (
            <RecipientChip
              key={chipKeys[index]}
              token={token}
              encrypted={encrypted}
              onRemove={() =>
                onChange(joinRecipientField(field.tokens.filter((_, other) => other !== index), field.draft))
              }
            />
          ))}
          {appearance === "field" ? (
            <Input {...sharedInputProps} className={inputClassName} />
          ) : (
            <input
              type="text"
              {...sharedInputProps}
              className={cn(
                "h-7 min-w-[8ch] flex-1 bg-transparent border-0 text-sm placeholder:text-muted-foreground",
                !chips && "w-full h-8",
                inputClassName,
              )}
            />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-anchor-width)] min-w-[20rem] max-w-[min(28rem,calc(100dvw-2rem))] overflow-hidden rounded-xl border-[var(--border-secondary,var(--border))] bg-[var(--bg-l3-solid,var(--popover))] p-1.5 shadow-[var(--shadow-l2,0_8px_24px_rgb(0_0_0/0.24))]"
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
            internalDomain={internalDomain}
            onSelect={selectSuggestion}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
