/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver; Radix Popper measures its arrow with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function wheel(target: Element) {
  return target.dispatchEvent(
    new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40 }),
  );
}

describe("PopoverContent inside a dialog", () => {
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

  it("lets the dialog's scroll lock pass wheel scrolling inside the popover", () => {
    act(() => {
      root.render(
        <Dialog open>
          <DialogContent showClose={false} aria-describedby={undefined}>
            <DialogTitle>Edit event</DialogTitle>
            <Popover open>
              <PopoverTrigger>12:30</PopoverTrigger>
              <PopoverContent>
                <button type="button">12:45</button>
              </PopoverContent>
            </Popover>
          </DialogContent>
        </Dialog>,
      );
    });

    const option = document.querySelector(
      "[data-slot='popover-content'] button",
    );
    expect(option).not.toBeNull();
    // The lock is active: wheel outside the dialog is still cancelled.
    expect(wheel(container)).toBe(false);
    expect(wheel(option as Element)).toBe(true);
  });
});
