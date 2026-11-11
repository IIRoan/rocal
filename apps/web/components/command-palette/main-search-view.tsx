import { useId, type ComponentType } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { ChevronRight, Search } from "lucide-react";

import type { UseCommandPaletteSearchResult } from "@/hooks/use-command-palette-search";
import { getCommandPaletteListLength } from "@/lib/command-palette-interactions";
import { PaletteSectionLabel } from "./palette-ui";
import { UnifiedSearchResults } from "./unified-search-results";

type CommandPaletteMainSearchViewProps = {
  search: UseCommandPaletteSearchResult;
};

function SearchOnlyEmptyState({ debouncedQuery }: { debouncedQuery: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Search className="size-8 text-muted-foreground/20" />
      <p className="text-sm text-muted-foreground">
        {debouncedQuery.trim().length >= 2
          ? `No mail or calendar results found for "${debouncedQuery}"`
          : "Type to search mail and calendar"}
      </p>
    </div>
  );
}

function SearchOnlyIntroState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Search className="size-8 text-muted-foreground/20" />
      <p className="text-sm text-muted-foreground">
        Search across your mail and calendar from one place
      </p>
    </div>
  );
}

const RESULT_PLURAL_RULES = new Intl.PluralRules("en-US");

function resultCountLabel(count: number) {
  return RESULT_PLURAL_RULES.select(count) === "one"
    ? `${count} result`
    : `${count} results`;
}

function NavigationResultButton({
  description,
  icon: Icon,
  isSelected,
  label,
  onClick,
  optionId,
  resultIndex,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  isSelected: boolean;
  label: string;
  onClick: () => void;
  optionId: string;
  resultIndex: number;
}) {
  return (
    <button
      id={optionId}
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      data-index={resultIndex}
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-2 sm:py-1.5 min-h-[44px] w-full rounded-md text-left outline-none focus-visible:bg-hover/50 transition-colors group ${
        isSelected ? "bg-hover/50" : "hover:bg-hover/50"
      }`}
    >
      <div className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="h-[18px] w-[18px] sm:h-4 sm:w-4 text-muted-foreground" />
      </div>
      <span className="text-[15px] leading-[130%] flex-1 truncate">{label}</span>
      <span className="text-[13px] leading-[130%] text-muted-foreground hidden sm:block">
        {description}
      </span>
      <ChevronRight
        className={`size-4 text-muted-foreground/40 shrink-0 transition-opacity ${
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
        }`}
      />
    </button>
  );
}

export function CommandPaletteMainSearchView({
  search,
}: CommandPaletteMainSearchViewProps) {
  const {
    clearSearchQuery,
    debouncedQuery,
    isCommandMode,
    isSearchOnly,
    listRef,
    matchingCommands,
    searchResults,
    searchInputInteractionProps,
    searchInputRef,
    searchLoading,
    searchCoverageText,
    searchQuery,
    selectCommand,
    selectSearchResult,
    selectedIndex,
    selectNavigationItem,
    showEventSearch,
    totalSearchResults,
    visibleNavigationItems,
  } = search;
  const optionIdPrefix = useId();
  const listboxId = `${optionIdPrefix}-results`;
  const optionId = (index: number) => `${optionIdPrefix}-option-${index}`;
  const optionCount = getCommandPaletteListLength({
    isCommandMode,
    matchingCommandCount: matchingCommands.length,
    isSearchOnly,
    filteredItemCount: visibleNavigationItems.length,
    totalSearchEvents: totalSearchResults,
  });
  const hasQuery = isCommandMode || debouncedQuery.trim().length > 0;
  const resultStatus = !hasQuery
    ? ""
    : showEventSearch && searchLoading
      ? "Searching…"
      : optionCount === 0
        ? "No results"
        : resultCountLabel(optionCount);

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: "clamp(280px, 50svh, 420px)",
        maxHeight: "calc(100dvh - 200px)",
      }}
    >
      <div className="flex items-center gap-2 p-3 sm:py-2 border-b border-border/50">
        {isCommandMode && !isSearchOnly ? (
          <span className="text-sm font-medium text-accent">Command</span>
        ) : isSearchOnly ? (
          <div className="flex items-center justify-center size-6 rounded-md bg-accent/10 shrink-0">
            <Search className="size-3.5 text-accent" />
          </div>
        ) : (
          <Search className="size-4 text-muted-foreground shrink-0" />
        )}
        <Input
          ref={searchInputRef}
          type="text"
          role="combobox"
          aria-label={
            isSearchOnly
              ? "Search mail and calendar"
              : "Search mail, calendar & settings"
          }
          aria-autocomplete="list"
          aria-expanded={optionCount > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            selectedIndex < optionCount ? optionId(selectedIndex) : undefined
          }
          placeholder={
            isSearchOnly
              ? "Search mail and calendar…"
              : isCommandMode
                ? "Type a command…"
                : "Search mail, calendar & settings…"
          }
          value={searchQuery}
          {...searchInputInteractionProps}
          className="-ml-2 flex-1 h-8 rounded-md border-0 bg-transparent px-2 text-[15px] placeholder:text-muted-foreground focus-visible:bg-hover/40 focus-visible:ring-0"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSearchQuery}
            className="p-1 h-auto"
            aria-label="Clear search"
          >
            <svg
              aria-hidden="true"
              className="size-4 text-muted-foreground"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"></path>
            </svg>
          </Button>
        )}
      </div>
      <p role="status" className="sr-only">
        {resultStatus}
      </p>
      {showEventSearch && searchCoverageText ? (
        <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{searchCoverageText}</p>
      ) : null}
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Results"
        className="flex-1 overflow-y-auto overscroll-contain py-2"
      >
        {isCommandMode ? (
          matchingCommands.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No command found.
            </div>
          ) : (
            <div className="px-2">
              {matchingCommands.map((command, index) => (
                <NavigationResultButton
                  key={command.command}
                  optionId={optionId(index)}
                  resultIndex={index}
                  label={command.label}
                  description={command.description}
                  icon={command.icon}
                  isSelected={index === selectedIndex}
                  onClick={() => selectCommand(command)}
                />
              ))}
            </div>
          )
        ) : isSearchOnly ? (
          showEventSearch ? (
            searchResults.length > 0 || searchLoading ? (
              <UnifiedSearchResults
                results={searchResults}
                isLoading={searchLoading}
                onSelect={selectSearchResult}
                selectedIndex={selectedIndex}
                baseIndex={0}
                optionId={optionId}
              />
            ) : (
              <SearchOnlyEmptyState debouncedQuery={debouncedQuery} />
            )
          ) : (
            <SearchOnlyIntroState />
          )
        ) : (
          <>
            {showEventSearch && (
              <UnifiedSearchResults
                results={searchResults}
                isLoading={searchLoading}
                onSelect={selectSearchResult}
                selectedIndex={selectedIndex}
                baseIndex={0}
                optionId={optionId}
              />
            )}
            {visibleNavigationItems.length === 0 &&
            !showEventSearch &&
            !debouncedQuery.trim() ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : visibleNavigationItems.length > 0 ? (
              <div className="px-2">
                {showEventSearch && searchResults.length > 0 && (
                  <PaletteSectionLabel>Settings</PaletteSectionLabel>
                )}
                {visibleNavigationItems.map((item, index) => {
                  const globalIndex = totalSearchResults + index;

                  return (
                    <NavigationResultButton
                      key={item.id}
                      optionId={optionId(globalIndex)}
                      resultIndex={globalIndex}
                      label={item.label}
                      description={item.description}
                      icon={item.icon}
                      isSelected={globalIndex === selectedIndex}
                      onClick={() => selectNavigationItem(item)}
                    />
                  );
                })}
              </div>
            ) : showEventSearch &&
              searchResults.length === 0 &&
              !searchLoading ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No mail or calendar results found for &quot;{debouncedQuery}&quot;
              </div>
            ) : !debouncedQuery.trim() ? (
              <p className="px-4 pt-1 pb-2 text-[11px] text-muted-foreground">
                Searches mail, calendar, and settings
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
