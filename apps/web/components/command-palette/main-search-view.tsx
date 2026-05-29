import type { ComponentType } from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { ChevronRight, Search } from "lucide-react";

import type { UseCommandPaletteSearchResult } from "@/hooks/use-command-palette-search";
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

function NavigationResultButton({
  description,
  icon: Icon,
  isSelected,
  label,
  onClick,
  resultIndex,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  isSelected: boolean;
  label: string;
  onClick: () => void;
  resultIndex: number;
}) {
  return (
    <button
      data-index={resultIndex}
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-2 sm:py-1.5 min-h-[44px] w-full rounded-md text-left focus:outline-none transition-colors group ${
        isSelected ? "bg-accent/50" : "hover:bg-accent/50"
      }`}
    >
      <div className="flex items-center justify-center size-8 sm:w-6 sm:h-6 shrink-0">
        <Icon className="h-[18px] w-[18px] sm:h-4 sm:w-4 text-muted-foreground" />
      </div>
      <span className="text-sm flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground hidden sm:block group-hover:text-muted-foreground/70">
        {description}
      </span>
      <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
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
    searchQuery,
    selectCommand,
    selectSearchResult,
    selectedIndex,
    selectNavigationItem,
    showEventSearch,
    totalSearchResults,
    visibleNavigationItems,
  } = search;

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
          <span className="text-sm font-medium text-primary">Command</span>
        ) : isSearchOnly ? (
          <div className="flex items-center justify-center size-6 rounded-md bg-primary/10 shrink-0">
            <Search className="size-3.5 text-primary" />
          </div>
        ) : (
          <Search className="size-4 text-muted-foreground shrink-0" />
        )}
        <Input
          ref={searchInputRef}
          type="text"
          placeholder={
            isSearchOnly
            ? "Search mail and calendar..."
              : isCommandMode
                ? "Type a command..."
                : "Search mail, calendar & settings…"
          }
          value={searchQuery}
          {...searchInputInteractionProps}
          className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:border-0 focus:outline-none rounded-none px-0 text-sm placeholder:text-muted-foreground/60"
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
          >
            <svg
              className="size-4 text-muted-foreground"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"></path>
            </svg>
          </Button>
        )}
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto py-2">
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
                  <div className="px-2 pt-1 pb-1">
                    <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                      Settings
                    </span>
                  </div>
                )}
                {visibleNavigationItems.map((item, index) => {
                  const globalIndex = totalSearchResults + index;

                  return (
                    <NavigationResultButton
                      key={item.id}
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
              <p className="px-4 pt-1 pb-2 text-[11px] text-muted-foreground/50">
                Searches mail, calendar, and settings
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
