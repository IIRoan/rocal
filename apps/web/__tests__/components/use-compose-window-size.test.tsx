/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { useComposeWindowSize } from "../../components/mail/use-compose-window-size";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const { size, windowRef, handleProps } = useComposeWindowSize();
  return (
    <div ref={windowRef} data-testid="window" style={{ width: size.width, height: size.height }}>
      <div data-testid="left" {...handleProps("left")} />
      <div data-testid="corner" {...handleProps("corner")} />
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // jsdom has no layout, so an element measures what its inline style says.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.width) || 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.height) || 0;
    },
  });
  HTMLElement.prototype.setPointerCapture = jest.fn();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function drag(handle: string, from: [number, number], to: [number, number]) {
  const element = container.querySelector(`[data-testid="${handle}"]`);
  if (!element) throw new Error(`No ${handle} handle`);
  const fire = (type: string, [clientX, clientY]: [number, number]) =>
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY }));
  act(() => {
    fire("pointerdown", from);
    fire("pointermove", to);
    fire("pointerup", to);
  });
}

function windowStyle() {
  const style = container.querySelector<HTMLElement>('[data-testid="window"]')?.style;
  return [style?.width, style?.height];
}

describe("useComposeWindowSize", () => {
  it("grows from the top-left corner, stops 8px from the viewport and resets on double-click", () => {
    expect(windowStyle()).toEqual(["880px", "830px"]);

    drag("corner", [600, 100], [400, 0]);
    expect(windowStyle()).toEqual(["1080px", "884px"]);

    drag("left", [500, 300], [900, 50]);
    expect(windowStyle()).toEqual(["680px", "884px"]);

    act(() => {
      container.querySelector('[data-testid="left"]')?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(windowStyle()).toEqual(["880px", "830px"]);
  });
});
