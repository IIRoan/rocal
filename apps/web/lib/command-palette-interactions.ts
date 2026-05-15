type CommandLike = {
  command: string;
  label: string;
};

type SearchItemLike = {
  label: string;
  description: string;
  keywords?: string[];
};

type VisiblePaletteNavigationItemsInput<TItem> = {
  isCommandMode: boolean;
  query: string;
  filteredItems: TItem[];
  rootItems: TItem[];
};

type PaletteListLengthInput = {
  isCommandMode: boolean;
  matchingCommandCount: number;
  isSearchOnly: boolean;
  filteredItemCount: number;
  totalSearchEvents: number;
};

type ResolvePaletteEnterSelectionInput<TCommand, TEvent, TItem> = {
  isCommandMode: boolean;
  showEventSearch: boolean;
  selectedIndex: number;
  totalSearchEvents: number;
  isSearchOnly: boolean;
  matchingCommands: TCommand[];
  searchEvents: TEvent[];
  filteredItems: TItem[];
};

export type PaletteEnterSelection<TCommand, TEvent, TItem> =
  | { type: "command"; command: TCommand }
  | { type: "search-event"; event: TEvent }
  | { type: "navigation"; item: TItem }
  | { type: "none" };

export function isCommandPaletteMode(searchQuery: string) {
  return searchQuery.trim().startsWith(">");
}

export function getCommandPaletteCommandQuery(searchQuery: string) {
  if (!isCommandPaletteMode(searchQuery)) {
    return "";
  }

  return searchQuery.trim().slice(1).trim().toLowerCase();
}

export function getMatchingPaletteCommands<TCommand extends CommandLike>(
  commands: TCommand[],
  isCommandMode: boolean,
  commandQuery: string,
) {
  if (!isCommandMode) {
    return [] as TCommand[];
  }

  if (!commandQuery) {
    return commands;
  }

  return commands.filter(
    (command) =>
      command.command.includes(commandQuery) ||
      command.label.toLowerCase().includes(commandQuery),
  );
}

export function filterPaletteNavigationItems<TItem extends SearchItemLike>(
  items: TItem[],
  isCommandMode: boolean,
  query: string,
) {
  if (isCommandMode) {
    return [] as TItem[];
  }

  if (!query.trim()) {
    return items;
  }

  const normalizedQuery = query.toLowerCase();

  return items.filter((item) => {
    const labelMatch = item.label.toLowerCase().includes(normalizedQuery);
    const descriptionMatch = item.description
      .toLowerCase()
      .includes(normalizedQuery);
    const keywordsMatch = item.keywords?.some((keyword) =>
      keyword.includes(normalizedQuery),
    );

    return labelMatch || descriptionMatch || keywordsMatch;
  });
}

export function getVisiblePaletteNavigationItems<TItem>(
  input: VisiblePaletteNavigationItemsInput<TItem>,
) {
  if (input.isCommandMode) {
    return [] as TItem[];
  }

  if (!input.query.trim()) {
    return input.rootItems;
  }

  return input.filteredItems;
}

export function getCommandPaletteListLength(input: PaletteListLengthInput) {
  if (input.isCommandMode) {
    return input.matchingCommandCount;
  }

  if (input.isSearchOnly) {
    return input.totalSearchEvents;
  }

  return input.filteredItemCount + input.totalSearchEvents;
}

export function moveCommandPaletteSelection(
  selectedIndex: number,
  direction: -1 | 1,
  currentListLength: number,
) {
  if (currentListLength <= 0) {
    return 0;
  }

  if (direction > 0) {
    return Math.min(selectedIndex + 1, currentListLength - 1);
  }

  return Math.max(selectedIndex - 1, 0);
}

export function resolvePaletteEnterSelection<TCommand, TEvent, TItem>(
  input: ResolvePaletteEnterSelectionInput<TCommand, TEvent, TItem>,
): PaletteEnterSelection<TCommand, TEvent, TItem> {
  if (input.isCommandMode) {
    const command = input.matchingCommands[input.selectedIndex];
    return command ? { type: "command", command } : { type: "none" };
  }

  if (input.showEventSearch && input.selectedIndex < input.totalSearchEvents) {
    const event = input.searchEvents[input.selectedIndex];
    return event ? { type: "search-event", event } : { type: "none" };
  }

  if (input.isSearchOnly) {
    return { type: "none" };
  }

  const navIndex = input.selectedIndex - input.totalSearchEvents;
  const item = input.filteredItems[navIndex];

  return item ? { type: "navigation", item } : { type: "none" };
}
