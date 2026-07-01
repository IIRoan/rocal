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
import {
  useMailKeyboardShortcuts,
  type MailKeyboardShortcutActions,
} from "@/hooks/use-mail-keyboard-shortcuts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function ShortcutHarness({
  actions,
  enabled = true,
}: {
  actions: MailKeyboardShortcutActions;
  enabled?: boolean;
}) {
  useMailKeyboardShortcuts(actions, enabled);
  return <div />;
}

function createActions(): MailKeyboardShortcutActions {
  return {
    navigatePrev: jest.fn(),
    navigateNext: jest.fn(),
    reply: jest.fn(),
    replyAll: jest.fn(),
    forward: jest.fn(),
    archive: jest.fn(),
    deleteMessage: jest.fn(),
    toggleFlagged: jest.fn(),
    markAsRead: jest.fn(),
    markAsUnread: jest.fn(),
    toggleReadUnread: jest.fn(),
    compose: jest.fn(),
    refresh: jest.fn(),
    closeMessage: jest.fn(),
    focusSearch: jest.fn(),
  };
}

describe("useMailKeyboardShortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it("focuses search on / and prevents the default action", async () => {
    const actions = createActions();

    await act(async () => {
      root.render(<ShortcutHarness actions={actions} />);
    });

    const event = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = jest.spyOn(event, "preventDefault");
    await act(async () => {
      document.body.dispatchEvent(event);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(actions.focusSearch).toHaveBeenCalledTimes(1);
  });

  it("does not trigger shortcuts while typing in an input", async () => {
    const actions = createActions();

    await act(async () => {
      root.render(<ShortcutHarness actions={actions} />);
    });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", {
      key: "/",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: input });

    await act(async () => {
      document.body.dispatchEvent(event);
    });

    expect(actions.focusSearch).not.toHaveBeenCalled();

    input.remove();
  });
});
