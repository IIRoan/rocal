/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePaintedValue } from "./use-painted-value";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const seen: boolean[] = [];

function Harness({ value, onRender }: { value: boolean; onRender: (painted: boolean) => void }) {
  const painted = usePaintedValue(value);
  useEffect(() => onRender(painted));
  return null;
}

function record(painted: boolean) {
  seen.push(painted);
}

function render(value: boolean) {
  act(() => root.render(React.createElement(Harness, { value, onRender: record })));
}

const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  seen.length = 0;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("usePaintedValue", () => {
  it("starts on the initial value and follows a change only after it has painted", async () => {
    render(false);
    render(true);
    expect(seen.at(-1)).toBe(false);

    await nextFrame();
    expect(seen.at(-1)).toBe(false);
    await nextFrame();
    expect(seen.at(-1)).toBe(true);
  });

  it("drops a pending change that is reverted before it paints", async () => {
    render(false);
    render(true);
    render(false);

    await nextFrame();
    await nextFrame();
    expect(seen).not.toContain(true);
  });
});
