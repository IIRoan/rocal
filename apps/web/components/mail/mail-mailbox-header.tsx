"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { MOTION_EASING, slideFadeIn } from "@workspace/ui/lib/motion";
import { cn } from "@workspace/ui/lib/utils";
import {
  Icon,
  Icons,
  IconText,
  Typography,
  TypographyWeight,
  WarmTooltipGroup,
} from "@workspace/ui/solace";
import { AdvancedSearchPanel, AdvancedSearchToggle } from "./advanced-search-panel";
import { filtersToChips } from "@/lib/mail/mail-search-filter";
import type { MailSearchFilters } from "@/lib/mail/mail-search-filter";
import {
  MAIL_LIST_VIEW_FILTERS,
  type MailListViewFilter,
} from "./mail-app-list-chrome-state";

export function MailMailboxHeader({
  title,
  unreadCount,
  filter,
  searchInputRef,
  search,
  advanced,
  refresh,
  emptyFolder,
  onMarkAllRead,
}: {
  title: string;
  unreadCount: number;
  filter: {
    value: MailListViewFilter;
    onChange: (value: MailListViewFilter) => void;
  };
  searchInputRef: Ref<HTMLInputElement | null>;
  search: {
    open: boolean;
    value: string;
    busy: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (value: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
    onClear: () => void;
  };
  advanced: {
    filters: MailSearchFilters;
    expanded: boolean;
    onFiltersChange: (filters: MailSearchFilters) => void;
    onExpandedChange: (expanded: boolean) => void;
  };
  refresh: { spinning: boolean; disabled: boolean; onClick: () => void };
  emptyFolder?: { label: string; onClick: () => void };
  onMarkAllRead?: () => void;
}) {
  const { open: searchOpen } = search;
  return (
    <header className="flex shrink-0 flex-col border-b border-[var(--border-tertiary)] bg-[var(--bg-l2-solid)]">
      {searchOpen ? (
        <MailboxSearchRow
          title={title}
          search={search}
          searchInputRef={searchInputRef}
          advanced={advanced}
        />
      ) : (
        <MailboxTitleRow
          title={title}
          onOpenSearch={() => search.onOpenChange(true)}
          refresh={refresh}
          emptyFolder={emptyFolder}
          onMarkAllRead={onMarkAllRead}
        />
      )}
      <MailboxFilterTabs filter={filter} unreadCount={unreadCount} />
      {searchOpen ? (
        <AdvancedSearchPanel
          className="px-3 pb-2.5"
          filters={advanced.filters}
          onFiltersChange={advanced.onFiltersChange}
          expanded={advanced.expanded}
          onExpandedChange={advanced.onExpandedChange}
        />
      ) : null}
    </header>
  );
}

function MailboxTitleRow({
  title,
  onOpenSearch,
  refresh,
  emptyFolder,
  onMarkAllRead,
}: {
  title: string;
  onOpenSearch: () => void;
  refresh: { spinning: boolean; disabled: boolean; onClick: () => void };
  emptyFolder?: { label: string; onClick: () => void };
  onMarkAllRead?: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The folder or label name crossfades when it changes or comes back from search; the buttons beside it stay put.
  useLayoutEffect(() => {
    const heading = titleRef.current;
    if (!heading) return;
    const enter = slideFadeIn(heading, null, { duration: 180, easing: MOTION_EASING.soft });
    return () => enter?.cancel();
  }, [title]);
  return (
    <div className="flex h-[52px] items-center gap-2 pr-3 pl-4">
      <h1 ref={titleRef} className="flex min-w-0 flex-1 tracking-normal" title={title}>
        <Typography weight={TypographyWeight.MEDIUM}>{title}</Typography>
      </h1>
      <WarmTooltipGroup lean={8}>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconText
            color="secondary"
            dataTest="mailbox-search"
            onClick={onOpenSearch}
            startIcon={Icon.Search}
            tooltip="Search"
          />
          <IconText
            onClick={refresh.disabled ? undefined : refresh.onClick}
            startIcon={
              <Icons
                className={refresh.spinning ? "animate-spin" : undefined}
                color="secondary"
                icon={Icon.Reload}
              />
            }
            tooltip="Refresh"
          />
          {onMarkAllRead ? (
            <IconText
              color="secondary"
              dataTest="mailbox-mark-all-read"
              onClick={onMarkAllRead}
              startIcon={Icon.EnvelopeRead}
              tooltip="Mark all as read"
            />
          ) : null}
          {emptyFolder ? (
            <IconText
              color="destructive"
              onClick={emptyFolder.onClick}
              startIcon={Icon.Trash}
              tooltip={emptyFolder.label}
            />
          ) : null}
        </div>
      </WarmTooltipGroup>
    </div>
  );
}

/** Search takes the title row's place: one field holding the query, its progress and the filters, beside a close button. */
function MailboxSearchRow({
  title,
  search,
  searchInputRef,
  advanced,
}: {
  title: string;
  search: Parameters<typeof MailMailboxHeader>[0]["search"];
  searchInputRef: Ref<HTMLInputElement | null>;
  advanced: Parameters<typeof MailMailboxHeader>[0]["advanced"];
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const enter = slideFadeIn(row, null, { duration: 160, easing: MOTION_EASING.soft });
    return () => enter?.cancel();
  }, []);
  return (
    <div ref={rowRef} className="flex h-[52px] items-center gap-1.5 pr-2 pl-3">
      <div
        data-field
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-[var(--bg-overlay-tertiary)] pr-1 pl-2.5"
      >
        <Search aria-hidden size={14} strokeWidth={2} className="shrink-0 text-[var(--icon-tertiary)]" />
        <input
          ref={searchInputRef}
          type="search"
          value={search.value}
          onChange={(event) => search.onChange(event.target.value)}
          onKeyDown={search.onKeyDown}
          aria-label="Search messages"
          placeholder={`Search ${title}`}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-tertiary)] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {search.busy ? (
          <RotateCcw aria-hidden size={12} strokeWidth={2} className="shrink-0 animate-spin text-[var(--icon-tertiary)]" />
        ) : null}
        <AdvancedSearchToggle
          expanded={advanced.expanded}
          onExpandedChange={advanced.onExpandedChange}
          activeCount={filtersToChips(advanced.filters).length}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          search.onClear();
          search.onOpenChange(false);
        }}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--icon-secondary)] transition-colors hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--icon-primary)]"
        aria-label="Close search"
      >
        <X aria-hidden size={15} strokeWidth={2.25} />
      </button>
    </div>
  );
}

/** The view filters stay in reach while searching, since they narrow the results too. */
function MailboxFilterTabs({
  filter,
  unreadCount,
}: {
  filter: Parameters<typeof MailMailboxHeader>[0]["filter"];
  unreadCount: number;
}) {
  return (
    <div role="group" aria-label="Show" className="flex items-center gap-1 px-3 pb-2.5">
      {MAIL_LIST_VIEW_FILTERS.map((option) => {
        const active = option.value === filter.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => filter.onChange(option.value)}
            className={cn(
              "inline-flex h-[26px] cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs transition-colors",
              active
                ? "bg-[var(--bg-overlay-secondary)] font-medium text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--text-primary)]",
            )}
          >
            {option.label}
            {option.value === "unread" && unreadCount > 0 ? (
              <span className="tabular-nums text-[var(--text-tertiary)]">{unreadCount.toLocaleString()}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
