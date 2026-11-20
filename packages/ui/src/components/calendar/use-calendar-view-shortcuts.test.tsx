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
import { useCalendarShortcuts } from "./use-calendar-view-shortcuts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const onViewChange = jest.fn<(view: CalendarView) => void>();
const actions = {
  onViewChange,
  onPrevious: jest.fn(),
  onNext: jest.fn(),
  onToday: jest.fn(),
  onGoToDate: jest.fn(),
  onCreate: jest.fn(),
  onSearch: jest.fn(),
  onHelp: jest.fn(),
};

function Harness({
  enabled = true,
  viewOnly = false,
}: {
  enabled?: boolean;
  viewOnly?: boolean;
}) {
  useCalendarShortcuts(viewOnly ? { onViewChange } : actions, enabled);
  return null;
}

describe("useCalendarShortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
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

  it.each(["combobox", "listbox"])(
    "leaves type-ahead to a select's %s, which opens outside the dialog",
    (role) => {
      const select = document.createElement("div");
      select.setAttribute("role", role);
      select.dataset.state = "closed";
      const option = document.createElement("div");
      select.appendChild(option);
      document.body.appendChild(select);

      for (const key of ["w", "c", "j", "/"]) press(option, key);

      expect(onViewChange).not.toHaveBeenCalled();
      expect(actions.onCreate).not.toHaveBeenCalled();
      expect(actions.onNext).not.toHaveBeenCalled();
      expect(actions.onSearch).not.toHaveBeenCalled();
    },
  );

  it("works again once a dialog closed with focus still inside it", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.dataset.state = "closed";
    const button = document.createElement("button");
    dialog.appendChild(button);
    document.body.appendChild(dialog);

    press(button, "m");

    expect(onViewChange).toHaveBeenCalledWith("month");
  });

  it.each([
    ["j", "onNext"],
    ["k", "onPrevious"],
    ["n", "onToday"],
    ["g", "onGoToDate"],
    ["c", "onCreate"],
    ["/", "onSearch"],
  ] as const)("runs %s", (key, handler) => {
    const event = press(document.body, key);

    expect(actions[handler]).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("accepts Shift only for symbols such as ?", () => {
    press(document.body, "?", { shiftKey: true });
    press(document.body, "J", { shiftKey: true });

    expect(actions.onHelp).toHaveBeenCalledTimes(1);
    expect(actions.onNext).not.toHaveBeenCalled();
  });

  it("turns every shortcut off when disabled", () => {
    act(() => root.render(<Harness enabled={false} />));

    for (const key of ["w", "j", "n", "g", "c", "/", "?"]) {
      press(document.body, key);
    }

    expect(onViewChange).not.toHaveBeenCalled();
    for (const handler of Object.values(actions)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it("leaves keys without a handler to the browser", () => {
    act(() => root.render(<Harness viewOnly />));

    const search = press(document.body, "/");
    press(document.body, "m");

    expect(search.defaultPrevented).toBe(false);
    expect(onViewChange).toHaveBeenCalledWith("month");
  });
});
