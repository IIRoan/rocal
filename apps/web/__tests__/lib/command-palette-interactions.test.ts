import { describe, expect, it } from "@jest/globals";

import {
  filterPaletteNavigationItems,
  getCommandPaletteCommandQuery,
  getCommandPaletteListLength,
  getMatchingPaletteCommands,
  getVisiblePaletteNavigationItems,
  isCommandPaletteMode,
  moveCommandPaletteSelection,
  resolvePaletteEnterSelection,
} from "../../lib/command-palette-interactions";

describe("command-palette-interactions", () => {
  const commands = [
    { command: "new event", label: "New Event" },
    { command: "open passkeys", label: "Open Passkeys" },
  ];
  const items = [
    {
      id: "appearance",
      label: "Appearance",
      description: "Theme and layout settings",
      keywords: ["theme", "dark mode"],
      targetView: "appearance",
    },
    {
      id: "security",
      label: "Security",
      description: "Security settings",
      keywords: ["passkey", "authentication"],
      targetView: "security",
    },
  ];
  const events = [
    { id: "event-1", title: "Planning" },
    { id: "event-2", title: "Retro" },
  ];

  it("detects command mode and matches commands by command text or label", () => {
    const isCommandMode = isCommandPaletteMode("  > pass  ");
    const commandQuery = getCommandPaletteCommandQuery("  > pass  ");

    expect(isCommandMode).toBe(true);
    expect(commandQuery).toBe("pass");
    expect(getMatchingPaletteCommands(commands, isCommandMode, commandQuery))
      .toEqual([{ command: "open passkeys", label: "Open Passkeys" }]);
    expect(getMatchingPaletteCommands(commands, false, commandQuery)).toEqual(
      [],
    );
    expect(getCommandPaletteCommandQuery("appearance")).toBe("");
    expect(getMatchingPaletteCommands(commands, true, "")).toEqual(commands);
  });

  it("filters navigation items by label, description, and keywords", () => {
    expect(filterPaletteNavigationItems(items, false, "theme")).toEqual([
      items[0],
    ]);
    expect(filterPaletteNavigationItems(items, false, "passkey")).toEqual([
      items[1],
    ]);
    expect(filterPaletteNavigationItems(items, false, "")).toEqual(items);
    expect(filterPaletteNavigationItems(items, true, "theme")).toEqual([]);
  });

  it("shows only root navigation items before the user types a search", () => {
    expect(
      getVisiblePaletteNavigationItems({
        filteredItems: items,
        isCommandMode: false,
        query: "",
        rootItems: [items[0]],
      }),
    ).toEqual([items[0]]);

    expect(
      getVisiblePaletteNavigationItems({
        filteredItems: items,
        isCommandMode: false,
        query: "pass",
        rootItems: [items[0]],
      }),
    ).toEqual(items);

    expect(
      getVisiblePaletteNavigationItems({
        filteredItems: items,
        isCommandMode: true,
        query: "",
        rootItems: [items[0]],
      }),
    ).toEqual([]);
  });

  it("clamps keyboard navigation and computes the visible list length", () => {
    expect(moveCommandPaletteSelection(3, 1, 0)).toBe(0);
    expect(moveCommandPaletteSelection(0, -1, 3)).toBe(0);
    expect(moveCommandPaletteSelection(0, 1, 3)).toBe(1);
    expect(moveCommandPaletteSelection(2, 1, 3)).toBe(2);
    expect(
      getCommandPaletteListLength({
        isCommandMode: true,
        matchingCommandCount: 2,
        isSearchOnly: false,
        filteredItemCount: 9,
        totalSearchEvents: 4,
      }),
    ).toBe(2);
    expect(
      getCommandPaletteListLength({
        isCommandMode: false,
        matchingCommandCount: 2,
        isSearchOnly: true,
        filteredItemCount: 9,
        totalSearchEvents: 4,
      }),
    ).toBe(4);
    expect(
      getCommandPaletteListLength({
        isCommandMode: false,
        matchingCommandCount: 2,
        isSearchOnly: false,
        filteredItemCount: 9,
        totalSearchEvents: 4,
      }),
    ).toBe(13);
  });

  it("resolves enter selections for commands, search results, and navigation", () => {
    expect(
      resolvePaletteEnterSelection({
        isCommandMode: true,
        showEventSearch: false,
        selectedIndex: 1,
        totalSearchEvents: 0,
        isSearchOnly: false,
        matchingCommands: commands,
        searchEvents: events,
        filteredItems: items,
      }),
    ).toEqual({ type: "command", command: commands[1] });

    expect(
      resolvePaletteEnterSelection({
        isCommandMode: false,
        showEventSearch: true,
        selectedIndex: 0,
        totalSearchEvents: 2,
        isSearchOnly: false,
        matchingCommands: commands,
        searchEvents: events,
        filteredItems: items,
      }),
    ).toEqual({ type: "search-event", event: events[0] });

    expect(
      resolvePaletteEnterSelection({
        isCommandMode: false,
        showEventSearch: true,
        selectedIndex: 2,
        totalSearchEvents: 2,
        isSearchOnly: false,
        matchingCommands: commands,
        searchEvents: events,
        filteredItems: items,
      }),
    ).toEqual({ type: "navigation", item: items[0] });

    expect(
      resolvePaletteEnterSelection({
        isCommandMode: false,
        showEventSearch: false,
        selectedIndex: 0,
        totalSearchEvents: 0,
        isSearchOnly: true,
        matchingCommands: commands,
        searchEvents: events,
        filteredItems: items,
      }),
    ).toEqual({ type: "none" });

    expect(
      resolvePaletteEnterSelection({
        isCommandMode: true,
        showEventSearch: false,
        selectedIndex: 9,
        totalSearchEvents: 0,
        isSearchOnly: false,
        matchingCommands: commands,
        searchEvents: events,
        filteredItems: items,
      }),
    ).toEqual({ type: "none" });

    expect(
      resolvePaletteEnterSelection({
        isCommandMode: false,
        showEventSearch: true,
        selectedIndex: 1,
        totalSearchEvents: 4,
        isSearchOnly: true,
        matchingCommands: commands,
        searchEvents: [events[0]],
        filteredItems: items,
      }),
    ).toEqual({ type: "none" });
  });
});