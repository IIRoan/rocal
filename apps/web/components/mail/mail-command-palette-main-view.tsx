"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import { cn } from "@workspace/ui/lib/utils";
import {
  FilledVariant,
  Icon,
  IconButton,
  Icons,
  Size,
  Type,
  Typography,
  TypographySize,
} from "@workspace/ui/solace";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { formatMessageDate } from "./mail-helpers";
import { PALETTE_VIEW_STYLE } from "../command-palette/palette-styles";
import type { MailPaletteItem } from "./mail-command-palette-items";

type PaletteResult = UnifiedSearchResult<JmapEmailMessage>;

function PaletteSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-px pb-1">
      <div className="px-2 pt-2 pb-1 text-[13px] font-[470] text-[var(--text-tertiary)]">
        {label}
      </div>
      {children}
    </section>
  );
}

function PaletteRow({
  index,
  isSelected,
  icon,
  title,
  subtitle,
  meta,
  onSelect,
}: {
  index: number;
  isSelected: boolean;
  icon: ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={isSelected ? "true" : undefined}
      data-index={index}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors",
        subtitle ? "min-h-12 py-1.5" : "min-h-11 sm:min-h-9",
        isSelected ? "bg-[var(--bg-cell-hover)]" : "hover:bg-[var(--bg-cell-hover)]",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center transition-colors",
          isSelected ? "text-[var(--icon-primary)]" : "text-[var(--icon-secondary)]",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Typography size={TypographySize.MEDIUM}>{title}</Typography>
        {subtitle ? (
          <Typography size={TypographySize.SMALL} color="tertiary">
            {subtitle}
          </Typography>
        ) : null}
      </span>
      {meta ? <span className="flex shrink-0 items-center gap-1.5">{meta}</span> : null}
    </button>
  );
}

function ResultRow({
  result,
  index,
  isSelected,
  onSelect,
}: {
  result: PaletteResult;
  index: number;
  isSelected: boolean;
  onSelect: (result: PaletteResult) => void;
}) {
  const isMail = result.source === "mail";
  return (
    <PaletteRow
      index={index}
      isSelected={isSelected}
      icon={<Icons icon={isMail ? Icon.Envelope : Icon.Calendar} size={Size.MEDIUM} color="source" />}
      title={result.title || "(No subject)"}
      subtitle={isMail ? (result.from ?? result.snippet) : result.snippet}
      meta={
        <Typography size={TypographySize.SMALL} color="disabled">
          {formatMessageDate(result.timestamp)}
        </Typography>
      }
      onSelect={() => onSelect(result)}
    />
  );
}

export function MailCommandPaletteMainView({
  query,
  onQueryChange,
  selectedIndex,
  showUnifiedSearch,
  unifiedResults,
  unifiedSearchLoading,
  mainListItems,
  onSelectItem,
  onSelectUnifiedResult,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  selectedIndex: number;
  showUnifiedSearch: boolean;
  unifiedResults: PaletteResult[];
  unifiedSearchLoading: boolean;
  mainListItems: MailPaletteItem[];
  onSelectItem: (item: MailPaletteItem) => void;
  onSelectUnifiedResult: (result: PaletteResult) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [isPointerFocused, setIsPointerFocused] = useState(false);
  const results = showUnifiedSearch ? unifiedResults : [];
  const mailResults = results.filter((result) => result.source === "mail");
  const eventResults = results.filter((result) => result.source === "calendar");
  const hasQuery = query.trim().length > 0;
  const isEmpty =
    results.length === 0 && mainListItems.length === 0 && !unifiedSearchLoading;

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div
      className="flex flex-col"
      style={PALETTE_VIEW_STYLE}
    >
      <div className="relative flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--border-secondary)] px-4">
        <Icons
          icon={Icon.Search}
          color={isPointerFocused ? "primary" : "secondary"}
        />
        <input
          type="text"
          aria-controls={listboxId}
          aria-label="Search mail and commands"
          placeholder="Search for mail, events, or settings"
          value={query}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onQueryChange(e.target.value)}
          onPointerDown={() => setIsPointerFocused(true)}
          onBlur={() => setIsPointerFocused(false)}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[17px] leading-[130%] tracking-[-0.01em] text-[var(--text-primary)] shadow-none outline-none ring-0 placeholder:text-[var(--text-disabled)] focus:border-0 focus:shadow-none focus:ring-0 focus-visible:outline-none"
        />
        {hasQuery ? (
          <IconButton
            icon={Icon.Close}
            onClick={() => onQueryChange("")}
            size={Size.SMALL}
            tooltip="Clear"
            type={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
        ) : null}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 -bottom-px h-px origin-left bg-[var(--border-hover)] transition-transform duration-200 ease-out",
            isPointerFocused ? "scale-x-100" : "scale-x-0",
          )}
        />
      </div>
      <div ref={listRef} id={listboxId} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        {mailResults.length > 0 ? (
          <PaletteSection label="Messages">
            {mailResults.map((result, i) => (
              <ResultRow
                key={`mail-${result.messageId}`}
                result={result}
                index={i}
                isSelected={i === selectedIndex}
                onSelect={onSelectUnifiedResult}
              />
            ))}
          </PaletteSection>
        ) : null}
        {eventResults.length > 0 ? (
          <PaletteSection label="Events">
            {eventResults.map((result, i) => {
              const index = mailResults.length + i;
              return (
                <ResultRow
                  key={`event-${result.eventId}`}
                  result={result}
                  index={index}
                  isSelected={index === selectedIndex}
                  onSelect={onSelectUnifiedResult}
                />
              );
            })}
          </PaletteSection>
        ) : null}
        {showUnifiedSearch && unifiedSearchLoading && results.length === 0 ? (
          <div className="px-2 py-3">
            <Typography size={TypographySize.SMALL} color="tertiary">
              Searching…
            </Typography>
          </div>
        ) : null}
        {mainListItems.length > 0 ? (
          <PaletteSection label={hasQuery ? "Actions" : "Quick actions"}>
            {mainListItems.map((item, i) => {
              const index = results.length + i;
              return (
                <PaletteRow
                  key={item.id}
                  index={index}
                  isSelected={index === selectedIndex}
                  icon={<item.icon className="size-4" strokeWidth={2} />}
                  title={item.label}
                  meta={
                    <Typography size={TypographySize.SMALL} color="disabled">
                      {item.description}
                    </Typography>
                  }
                  onSelect={() => onSelectItem(item)}
                />
              );
            })}
          </PaletteSection>
        ) : null}
        {isEmpty ? (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <Typography size={TypographySize.MEDIUM} color="secondary">
              No results
            </Typography>
            <Typography size={TypographySize.SMALL} color="tertiary" wrap>
              Try a different sender, subject, or setting name.
            </Typography>
          </div>
        ) : null}
      </div>
    </div>
  );
}
