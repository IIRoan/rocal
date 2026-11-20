/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it } from "@jest/globals";
import { createRoot } from "react-dom/client";

import { CalendarShortcutsDialog } from "./calendar-shortcuts-dialog";
import { CALENDAR_SHORTCUTS } from "./use-calendar-view-shortcuts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("CalendarShortcutsDialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lists every calendar shortcut and the palette chords", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() =>
      root.render(<CalendarShortcutsDialog open onOpenChange={() => {}} />),
    );

    const rows = Array.from(document.querySelectorAll("dt")).map((term) => [
      term.textContent,
      term.nextElementSibling?.textContent,
    ]);
    expect(rows).toEqual(
      expect.arrayContaining(
        CALENDAR_SHORTCUTS.map(({ key, label }) => [label, key]),
      ),
    );
    expect(rows).toContainEqual(["Today", "N"]);
    expect(rows).toContainEqual(["Search everything", "Ctrl+J"]);
    expect(rows.find(([label]) => label === "Commands")?.[1]).toMatch(/\.$/);

    act(() => root.unmount());
  });
});
