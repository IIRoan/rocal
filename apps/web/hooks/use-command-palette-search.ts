"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type RefObject,
} from "react";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import type { JmapEmailMessage } from "@/lib/mail/types";

import {
  COMMANDS,
  NAVIGATION_ITEMS,
  SEARCH_INDEX,
  type Command,
} from "@/components/command-palette/navigation-config";
import type { PaletteView } from "@/components/command-palette/constants";
import {
  filterPaletteNavigationItems,
  getCommandPaletteCommandQuery,
  getCommandPaletteListLength,
  getMatchingPaletteCommands,
  getVisiblePaletteNavigationItems,
  isCommandPaletteMode,
  moveCommandPaletteSelection,
  resolvePaletteEnterSelection,
} from "@/lib/command-palette-interactions";
import {
  isTextEntryElement,
  stopEventPropagation,
} from "@/lib/event-propagation";
import { useUnifiedSearch } from "./use-unified-search";

type PaletteSearchItem = (typeof SEARCH_INDEX)[number];

type SearchInputInteractionProps = {
  onBlur: FocusEventHandler<HTMLInputElement>;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onClick: MouseEventHandler<HTMLInputElement>;
  onFocus: FocusEventHandler<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
};

type UseCommandPaletteSearchOptions = {
  open: boolean;
  currentView: PaletteView;
  initialSearchQuery: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showMainView: () => void;
  onOpenChange: (open: boolean) => void;
  executeCommand: (command: Command) => void;
  goForward: (view: PaletteView) => void;
  onSearchResultSelect: (
    result: UnifiedSearchResult<JmapEmailMessage>,
  ) => void;
};

export type UseCommandPaletteSearchResult = {
  clearSearchQuery: () => void;
  debouncedQuery: string;
  filteredItems: PaletteSearchItem[];
  isCommandMode: boolean;
  isSearchOnly: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  matchingCommands: Command[];
  searchEvents: CalendarEvent[];
  searchResults: UnifiedSearchResult<JmapEmailMessage>[];
  searchInputInteractionProps: SearchInputInteractionProps;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchLoading: boolean;
  searchQuery: string;
  selectCommand: (command: Command) => void;
  selectedIndex: number;
  selectNavigationItem: (item: PaletteSearchItem) => void;
  selectSearchResult: (
    result: UnifiedSearchResult<JmapEmailMessage>,
  ) => void;
  showEventSearch: boolean;
  totalSearchEvents: number;
  totalSearchResults: number;
  visibleNavigationItems: PaletteSearchItem[];
};

export function useCommandPaletteSearch({
  open,
  currentView,
  initialSearchQuery,
  searchQuery,
  setSearchQuery,
  showMainView,
  onOpenChange,
  executeCommand,
  goForward,
  onSearchResultSelect,
}: UseCommandPaletteSearchOptions): UseCommandPaletteSearchResult {
  const [debouncedQuery, setDebouncedQuery] = useState(initialSearchQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isSearchOnly = currentView === "search";
  const isCommandMode = isCommandPaletteMode(searchQuery);
  const commandQuery = getCommandPaletteCommandQuery(searchQuery);

  const matchingCommands = useMemo(
    () => getMatchingPaletteCommands(COMMANDS, isCommandMode, commandQuery),
    [isCommandMode, commandQuery],
  );
  const filteredItems = useMemo(
    () =>
      filterPaletteNavigationItems(SEARCH_INDEX, isCommandMode, debouncedQuery),
    [isCommandMode, debouncedQuery],
  );
  const visibleNavigationItems = useMemo(
    () =>
      getVisiblePaletteNavigationItems({
        filteredItems,
        isCommandMode,
        query: debouncedQuery,
        rootItems: NAVIGATION_ITEMS.filter((item) => item.parent === null),
      }),
    [filteredItems, isCommandMode, debouncedQuery],
  );
  const showEventSearch = !isCommandMode && debouncedQuery.trim().length >= 2;
  const {
    results: rawSearchResults,
    isFetching: searchLoading,
  } = useUnifiedSearch({
    query: debouncedQuery,
    enabled: showEventSearch,
    includeMail: true,
    includeCalendar: true,
    limit: 15,
  });
  // Reorder so array indices match the visual layout (mail first, then calendar)
  const searchResults = useMemo(() => {
    const mail = rawSearchResults.filter((r) => r.source === "mail");
    const calendar = rawSearchResults.filter((r) => r.source === "calendar");
    return [...mail, ...calendar];
  }, [rawSearchResults]);
  const searchEvents = searchResults.flatMap((result) =>
    result.source === "calendar" ? [result.event] : [],
  );
  const totalSearchEvents = showEventSearch ? searchResults.length : 0;
  const totalSearchResults = showEventSearch ? searchResults.length : 0;
  const currentListLength = getCommandPaletteListLength({
    isCommandMode,
    matchingCommandCount: matchingCommands.length,
    isSearchOnly,
    filteredItemCount: visibleNavigationItems.length,
    totalSearchEvents,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (open && initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
      const timer = setTimeout(() => {
        setDebouncedQuery(initialSearchQuery);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, initialSearchQuery, setSearchQuery]);

  useEffect(() => {
    if (open && currentView === "main") {
      const frameId = requestAnimationFrame(() => {
        setSelectedIndex(0);

        if (searchInputRef.current) {
          searchInputRef.current.focus();

          if (initialSearchQuery === ">") {
            searchInputRef.current.setSelectionRange(1, 1);
          }
        }
      });

      return () => cancelAnimationFrame(frameId);
    }
  }, [open, currentView, initialSearchQuery]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setSelectedIndex(0);
    });
    return () => cancelAnimationFrame(frameId);
  }, [debouncedQuery, isCommandMode, commandQuery, isSearchOnly]);

  useEffect(() => {
    if (listRef.current && currentListLength > 0) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );

      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, currentListLength]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ">" || isTextEntryElement(event.target)) {
        return;
      }

      event.preventDefault();
      showMainView();
      setSearchQuery(">");

      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.setSelectionRange(1, 1);
      });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setSearchQuery, showMainView]);

  const clearSearchQuery = useCallback(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  const selectCommand = useCallback(
    (command: Command) => {
      executeCommand(command);
    },
    [executeCommand],
  );

  const selectNavigationItem = useCallback(
    (item: PaletteSearchItem) => {
      goForward(item.targetView as PaletteView);
    },
    [goForward],
  );

  const selectSearchResult = useCallback(
    (result: UnifiedSearchResult<JmapEmailMessage>) => {
      onSearchResultSelect(result);
    },
    [onSearchResultSelect],
  );

  const handleSearchInputChange = useCallback<
    ChangeEventHandler<HTMLInputElement>
  >(
    (event) => {
      stopEventPropagation(event);
      setSearchQuery(event.target.value);
    },
    [setSearchQuery],
  );

  const handleSearchInputKeyDown = useCallback<
    KeyboardEventHandler<HTMLInputElement>
  >(
    (event) => {
      if (event.key === "Backspace" && searchQuery === ">") {
        setSearchQuery("");
        return;
      }

      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((previousIndex) =>
          moveCommandPaletteSelection(previousIndex, 1, currentListLength),
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((previousIndex) =>
          moveCommandPaletteSelection(previousIndex, -1, currentListLength),
        );
        return;
      }

      if (event.key !== "Enter" || currentListLength <= 0) {
        return;
      }

      event.preventDefault();

      const selection = resolvePaletteEnterSelection({
        isCommandMode,
        showEventSearch,
        selectedIndex,
        totalSearchEvents,
        isSearchOnly,
        matchingCommands,
        searchEvents: searchResults,
        filteredItems: visibleNavigationItems,
      });

      switch (selection.type) {
        case "command":
          selectCommand(selection.command);
          break;
        case "search-event":
          selectSearchResult(selection.event);
          break;
        case "navigation":
          selectNavigationItem(selection.item);
          break;
        default:
          break;
      }
    },
    [
      searchQuery,
      setSearchQuery,
      onOpenChange,
      currentListLength,
      isCommandMode,
      showEventSearch,
      selectedIndex,
      totalSearchEvents,
      isSearchOnly,
      matchingCommands,
      searchResults,
      visibleNavigationItems,
      selectCommand,
      selectSearchResult,
      selectNavigationItem,
    ],
  );

  const searchInputInteractionProps = useMemo(
    () => ({
      onBlur: stopEventPropagation,
      onChange: handleSearchInputChange,
      onClick: stopEventPropagation,
      onFocus: stopEventPropagation,
      onKeyDown: handleSearchInputKeyDown,
    }),
    [handleSearchInputChange, handleSearchInputKeyDown],
  );

  return {
    clearSearchQuery,
    debouncedQuery,
    filteredItems,
    isCommandMode,
    isSearchOnly,
    listRef,
    matchingCommands,
    searchEvents,
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
    totalSearchEvents,
    totalSearchResults,
    visibleNavigationItems,
  };
}
