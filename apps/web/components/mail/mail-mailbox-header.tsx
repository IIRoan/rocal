"use client";

import type { KeyboardEvent, Ref } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { Input } from "@workspace/ui/components/ui/input";
import {
  Dropdown,
  DropdownItem,
  FilledVariant,
  Icon,
  Icons,
  IconText,
  Size,
  Typography,
  TypographyWeight,
  WarmTooltipGroup,
} from "@workspace/ui/solace";
import { AdvancedSearchPanel, AdvancedSearchToggle, countActiveFilters } from "./advanced-search-panel";
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
}) {
  const filterLabel =
    MAIL_LIST_VIEW_FILTERS.find((option) => option.value === filter.value)
      ?.label ?? "All";
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
              placeholder="Search all messages…"
              className="h-8 w-full rounded-md border-0 bg-[var(--bg-overlay-tertiary)] pl-7 pr-8 text-[13px] shadow-none placeholder:text-[var(--text-disabled)] focus-visible:ring-1 focus-visible:ring-ring/40"
            />
            {searchBusy ? (
              <RotateCcw
                size={11}
                strokeWidth={2}
                className="pointer-events-none absolute right-2 animate-spin text-[var(--icon-disabled)]"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  onSearchClear();
                  onSearchOpenChange(false);
                }}
                className="absolute right-2 text-[var(--icon-disabled)] hover:text-[var(--icon-primary)]"
                aria-label="Close search"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-12 items-center gap-2 px-5 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Typography weight={TypographyWeight.MEDIUM}>{title}</Typography>
          {unreadCount > 0 ? (
            <Typography color="link" selectable={false}>
              {unreadCount.toLocaleString()}
            </Typography>
          ) : null}
        </div>
        <WarmTooltipGroup lean={8}>
        <div className="flex shrink-0 items-center gap-2">
          {searchOpen ? (
            <AdvancedSearchToggle
              expanded={advanced.expanded}
              onExpandedChange={advanced.onExpandedChange}
              activeCount={countActiveFilters(advanced.filters)}
            />
          ) : (
            <>
              <Dropdown
                width={176}
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-[27px] cursor-pointer items-center gap-1.5 rounded border border-[var(--border-secondary)] bg-[var(--cta-secondary-default)] px-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-overlay-tertiary)]"
                  >
                    {filterLabel}
                    <Icons
                      color="primary"
                      icon={Icon.ChevronDown}
                      size={Size.SMALL}
                    />
                  </button>
                }
              >
                {MAIL_LIST_VIEW_FILTERS.map((option) => (
                  <DropdownItem
                    key={option.value}
                    label={option.label}
                    active={option.value === filter.value}
                    onSelect={() => filter.onChange(option.value)}
                  />
                ))}
              </Dropdown>
              <IconText
                dataTest="mailbox-search"
                onClick={() => onSearchOpenChange(true)}
                startIcon={Icon.Search}
                tooltip="Search"
                variant={FilledVariant.FILLED}
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
                variant={FilledVariant.FILLED}
              />
              {emptyFolder ? (
                <IconText
                  color="destructive"
                  label={emptyFolder.label}
                  onClick={emptyFolder.onClick}
                  startIcon={Icon.Trash}
                  variant={FilledVariant.FILLED}
                  weight={TypographyWeight.REGULAR}
                />
              ) : null}
            </>
          )}
        </div>
        </WarmTooltipGroup>
      </div>
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
