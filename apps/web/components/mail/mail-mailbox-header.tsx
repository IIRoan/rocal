"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { Input } from "@workspace/ui/components/ui/input";
import { MOTION_EASING, slideFadeIn } from "@workspace/ui/lib/motion";
import { cn } from "@workspace/ui/lib/utils";
import {
  Icon,
  Icons,
  IconText,
  Size,
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
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The folder or label name crossfades when it changes; the buttons beside it stay put.
  useLayoutEffect(() => {
    const heading = titleRef.current;
    if (!heading) return;
    const enter = slideFadeIn(heading, null, { duration: 180, easing: MOTION_EASING.soft });
    return () => enter?.cancel();
  }, [title]);
  const {
    open: searchOpen,
    value: searchValue,
    busy: searchBusy,
    onOpenChange: onSearchOpenChange,
    onChange: onSearchChange,
    onKeyDown: onSearchKeyDown,
    onClear: onSearchClear,
  } = search;

  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--border-tertiary)] bg-[var(--bg-l2-solid)]">
      {searchOpen ? (
        <div className="px-5 pt-3">
          <div className="relative flex min-w-0 items-center">
            <Search
              size={13}
              strokeWidth={2}
              className="pointer-events-none absolute left-2.5 text-[var(--icon-disabled)]"
            />
            <Input
              ref={searchInputRef}
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={onSearchKeyDown}
              aria-label="Search messages"
              placeholder={`Search ${title}…`}
              className="h-8 w-full rounded-md border-0 bg-[var(--bg-overlay-tertiary)] pl-7 pr-8 text-[13px] shadow-none placeholder:text-[var(--text-tertiary)]"
            />
            {searchBusy ? (
              <RotateCcw
                size={11}
                strokeWidth={2}
                className="pointer-events-none absolute right-2 animate-spin text-[var(--icon-tertiary)]"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSearchClear();
                  onSearchOpenChange(false);
                }}
                className="absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded text-[var(--icon-secondary)] hover:text-[var(--icon-primary)]"
                aria-label="Close search"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-12 items-center gap-2 px-4 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h1 ref={titleRef} className="flex min-w-0 tracking-normal" title={title}>
            <Typography weight={TypographyWeight.MEDIUM}>
              {title}
            </Typography>
          </h1>
        </div>
        <WarmTooltipGroup lean={8}>
        <div className="flex shrink-0 items-center gap-0.5">
          {searchOpen ? (
            <AdvancedSearchToggle
              expanded={advanced.expanded}
              onExpandedChange={advanced.onExpandedChange}
              activeCount={filtersToChips(advanced.filters).length}
            />
          ) : (
            <>
              <IconText
                color="secondary"
                dataTest="mailbox-search"
                onClick={() => onSearchOpenChange(true)}
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
            </>
          )}
        </div>
        </WarmTooltipGroup>
      </div>
      {searchOpen ? null : (
        <div role="group" aria-label="Show" className="-mt-2 flex items-center gap-1 px-3 pb-2.5">
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
                  <span className="tabular-nums text-[var(--text-tertiary)]">
                    {unreadCount.toLocaleString()}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {searchOpen ? (
        <div className="px-5 pb-2">
          <AdvancedSearchPanel
            filters={advanced.filters}
            onFiltersChange={advanced.onFiltersChange}
            expanded={advanced.expanded}
            onExpandedChange={advanced.onExpandedChange}
          />
        </div>
      ) : null}
    </header>
  );
}
