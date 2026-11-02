/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

import type { CalendarView } from "./types";
import { useCalendarViewShortcuts } from "./use-calendar-view-shortcuts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const onViewChange = jest.fn<(view: CalendarView) => void>();

function Harness() {
  useCalendarViewShortcuts(onViewChange);
  return null;
}

describe("useCalendarViewShortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    onViewChange.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  const press = (
    target: EventTarget,
    key: string,
    init: KeyboardEventInit = {},
  ) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  };

  it("switches views with the plain letters the toolbar shows", () => {
    const pressed = press(document.body, "w");
    press(document.body, "t");
    press(document.body, "M");
    press(document.body, "d");
    press(document.body, "a");

    expect(onViewChange.mock.calls.map(([view]) => view)).toEqual([
      "week",
      "3day",
      "month",
      "day",
      "agenda",
    ]);
    expect(pressed.defaultPrevented).toBe(true);
  });

  it("leaves browser chords such as Cmd+W and Ctrl+T alone", () => {
    const closeTab = press(document.body, "w", { metaKey: true });
    press(document.body, "t", { ctrlKey: true });
    press(document.body, "d", { altKey: true });
    press(document.body, "W", { shiftKey: true });

    expect(onViewChange).not.toHaveBeenCalled();
    expect(closeTab.defaultPrevented).toBe(false);
  });

  it.each([
    ["input", () => document.createElement("input")],
    ["textarea", () => document.createElement("textarea")],
    ["select", () => document.createElement("select")],
  ])("lets letters type into a focused %s", (_name, create) => {
    const field = create();
    document.body.appendChild(field);
    field.focus();

    press(field, "w");

    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("stays out of open dialogs and menus", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);

    press(button, "m");

    expect(onViewChange).not.toHaveBeenCalled();
  });
});
