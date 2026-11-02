/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it } from "@jest/globals";
import { createRoot } from "react-dom/client";

import { Dropdown, DropdownItem } from "./dropdown";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Dropdown", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("returns focus to its trigger when Escape closes it", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      createRoot(container).render(
        <Dropdown trigger={<button type="button">More actions</button>}>
          <DropdownItem label="Forward" />
        </Dropdown>,
      );
    });
    const trigger = container.querySelector("button");
    if (!trigger) throw new Error("missing trigger");

    act(() => {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const item = document.body.querySelector<HTMLElement>('[role="menuitem"]');
    expect(item).not.toBeNull();

    await act(async () => {
      item?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.body.querySelector('[role="menuitem"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
