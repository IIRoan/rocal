/** @jest-environment jsdom */

import React, { act, createRef } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("../../components/command-palette/unified-search-results", () => ({
  UnifiedSearchResults: ({
    results,
  }: {
    results: Array<{ id: string; title: string }>;
  }) => <div data-testid="unified-search-results">{results[0]?.title}</div>,
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    ChevronRight: Icon,
    Search: Icon,
  };
});

import { CommandPaletteMainSearchView } from "../../components/command-palette/main-search-view";
import type { UseCommandPaletteSearchResult } from "../../hooks/use-command-palette-search";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("CommandPaletteMainSearchView", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders unified search results without crashing when search is visible", async () => {
    const search = {
      clearSearchQuery: () => {},
      debouncedQuery: "plan",
      filteredItems: [],
      isCommandMode: false,
      isSearchOnly: false,
      listRef: createRef<HTMLDivElement>(),
      matchingCommands: [],
      searchEvents: [
        {
          allDay: false,
          calendarId: "calendar-1",
          createdAt: new Date("2026-04-24T09:00:00.000Z"),
          end: new Date("2026-04-24T11:00:00.000Z"),
          id: "event-1",
          start: new Date("2026-04-24T10:00:00.000Z"),
          title: "Planning",
          updatedAt: new Date("2026-04-24T09:00:00.000Z"),
          userId: "user-1",
        },
      ],
      searchResults: [
        {
          id: "calendar:event-1",
          source: "calendar",
          eventId: "event-1",
          title: "Planning",
          score: 9,
          encryptionStatus: "plaintext",
          matchedFields: ["title"],
          event: {
            allDay: false,
            calendarId: "calendar-1",
            createdAt: new Date("2026-04-24T09:00:00.000Z"),
            end: new Date("2026-04-24T11:00:00.000Z"),
            id: "event-1",
            start: new Date("2026-04-24T10:00:00.000Z"),
            title: "Planning",
            updatedAt: new Date("2026-04-24T09:00:00.000Z"),
            userId: "user-1",
          },
        },
      ],
      searchInputInteractionProps: {
        onBlur: () => {},
        onChange: () => {},
        onClick: () => {},
        onFocus: () => {},
        onKeyDown: () => {},
      },
      searchInputRef: createRef<HTMLInputElement>(),
      searchLoading: false,
      searchQuery: "plan",
      selectCommand: () => {},
      selectedIndex: 0,
      selectNavigationItem: () => {},
      selectSearchResult: () => {},
      showEventSearch: true,
      totalSearchEvents: 1,
      totalSearchResults: 1,
      visibleNavigationItems: [],
    } satisfies UseCommandPaletteSearchResult;

    await act(async () => {
      root.render(<CommandPaletteMainSearchView search={search} />);
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="unified-search-results"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Planning");
  });
});
