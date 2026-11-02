/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

import { Dropdown, DropdownItem } from "./dropdown";
import { IconButton } from "./icon-button";
import { Icon } from "./icons.constants";

jest.mock("./warm-tooltip.css", () => ({}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function renderMenuTrigger(disabled: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <Dropdown
        trigger={<IconButton disabled={disabled} icon={Icon.OverflowH} tooltip="More actions" />}
      >
        <DropdownItem label="Forward" />
      </Dropdown>,
    );
  });
  const button = container.querySelector("button");
  if (!button) throw new Error("missing button");
  return button;
}

function activate(button: HTMLButtonElement) {
  act(() => {
    button.focus();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

describe("IconButton", () => {
  afterEach(() => {
    act(() => {
      roots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = "";
  });

  it("opens a wrapping menu when enabled", async () => {
    activate(renderMenuTrigger(false));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.querySelector('[role="menuitem"]')).not.toBeNull();
  });

  it("stays focusable but inert when disabled, so its tooltip can still open", () => {
    const button = renderMenuTrigger(true);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).toBe("true");

    activate(button);
    act(() => {
      button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      button.click();
    });

    expect(document.activeElement).toBe(button);
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toBe("More actions");
    expect(document.body.querySelector('[role="menuitem"]')).toBeNull();
  });
});
