/** @jest-environment jsdom */

import { describe, expect, it, jest } from "@jest/globals";
import { Inbox, SquarePen } from "lucide-react";
import { handleMailPaletteKeyDown } from "../../components/mail/mail-command-palette-actions";
import type { MailPaletteItem } from "../../components/mail/mail-command-palette-items";

jest.mock("lucide-react", () => ({ Inbox: () => null, SquarePen: () => null }));

const items: MailPaletteItem[] = [
  { id: "compose", label: "Compose", description: "", icon: SquarePen },
  { id: "mail-settings", label: "Mail settings", description: "", icon: Inbox },
];

function keyDown(key: string, target: EventTarget) {
  const preventDefault = jest.fn<() => void>();
  return {
    event: { key, target, preventDefault },
    preventDefault,
  };
}

function run(event: ReturnType<typeof keyDown>["event"]) {
  const onSelectItem = jest.fn();
  const onMoveSelection = jest.fn();
  handleMailPaletteKeyDown({
    event,
    currentView: "main",
    showUnifiedSearch: false,
    unifiedResults: [],
    mainListItems: items,
    selectedIndex: 0,
    onMoveSelection,
    onSelectUnified: jest.fn(),
    onSelectItem,
  });
  return { onSelectItem, onMoveSelection };
}

describe("handleMailPaletteKeyDown", () => {
  it("activates the highlighted item on Enter in the search input", () => {
    const { event, preventDefault } = keyDown("Enter", document.createElement("input"));
    const { onSelectItem } = run(event);
    expect(onSelectItem).toHaveBeenCalledWith(items[0]);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("leaves Enter and arrows on a focused row to the row itself", () => {
    const row = document.createElement("button");
    const enter = keyDown("Enter", row);
    const arrow = keyDown("ArrowDown", row);
    expect(run(enter.event).onSelectItem).not.toHaveBeenCalled();
    expect(run(arrow.event).onMoveSelection).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
  });
});
