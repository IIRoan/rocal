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
  SurfaceMotionProvider,
  shouldPreserveTransformAnimation,
} from "./surface-motion-provider";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("shouldPreserveTransformAnimation", () => {
  it("preserves centered dialog content transforms", () => {
    const node = document.createElement("div");

    node.setAttribute("data-slot", "dialog-content");
    node.setAttribute("data-variant", "spotlight");

    expect(
      shouldPreserveTransformAnimation(
        node,
        "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 dialog-spotlight-animation",
      ),
    ).toBe(true);
  });

  it("preserves any surface that relies on translate utility classes", () => {
    const node = document.createElement("div");

    expect(
      shouldPreserveTransformAnimation(
        node,
        "absolute -translate-x-1/2 animate-in fade-in-0",
      ),
    ).toBe(true);
  });

  it("keeps transform-based motion enabled for sheet surfaces", () => {
    const node = document.createElement("div");

    node.setAttribute("data-slot", "sheet-content");

    expect(
      shouldPreserveTransformAnimation(
        node,
        "animate-in slide-in-from-right fade-in-0",
      ),
    ).toBe(false);
  });
});

describe("SurfaceMotionProvider", () => {
  type AnimateCall = [Keyframe[], KeyframeAnimationOptions];
  let container: HTMLDivElement;
  let root: Root;
  let animate: jest.Mock<(...args: AnimateCall) => Animation>;
  let cancel: jest.Mock<() => void>;

  const flushFrame = () =>
    act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

  const surface = (className: string, state: string) => {
    const node = document.createElement("div");
    node.className = className;
    node.setAttribute("data-slot", "sheet-content");
    node.setAttribute("data-state", state);
    return node;
  };

  beforeEach(() => {
    cancel = jest.fn();
    animate = jest.fn(() => ({ cancel }) as Partial<Animation> as Animation);
    // jsdom has no WAAPI; the stub records what the provider asks the compositor to run.
    HTMLElement.prototype.animate =
      animate as unknown as HTMLElement["animate"];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(React.createElement(SurfaceMotionProvider));
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it("slides a surface in with opacity and transform only when it opens", async () => {
    const node = surface(
      "data-[state=open]:animate-in data-[state=open]:slide-in-from-right fade-in-0",
      "closed",
    );
    document.body.appendChild(node);
    await flushFrame();
    expect(animate).not.toHaveBeenCalled();

    node.setAttribute("data-state", "open");
    await flushFrame();

    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes] = animate.mock.calls[0]!;
    expect(keyframes[0]).toMatchObject({ opacity: 0 });
    expect(keyframes[1]).toMatchObject({ opacity: 1, transform: "none" });
    for (const frame of keyframes) {
      expect(Object.keys(frame).sort()).toEqual(
        ["opacity", "transform", "visibility"].sort(),
      );
    }
  });

  it("treats Radix tooltip delayed-open as open", async () => {
    const node = surface("animate-in fade-in-0 zoom-in-95", "closed");
    document.body.appendChild(node);
    await flushFrame();

    node.setAttribute("data-state", "delayed-open");
    await flushFrame();

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![0][1]).toMatchObject({ opacity: 1 });
  });

  it("holds the hidden end state on close and cancels it on reopen", async () => {
    const node = surface("animate-in animate-out fade-in-0 fade-out-0", "open");
    document.body.appendChild(node);
    await flushFrame();
    animate.mockClear();

    node.setAttribute("data-state", "closed");
    await flushFrame();

    const [keyframes, options] = animate.mock.calls[0]!;
    expect(keyframes[1]).toMatchObject({ opacity: 0, visibility: "hidden" });
    expect(options.fill).toBe("forwards");

    node.setAttribute("data-state", "open");
    await flushFrame();

    expect(cancel).toHaveBeenCalled();
  });

  it("ignores class changes on elements without motion classes", async () => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    await flushFrame();

    node.className = "bg-background";
    node.setAttribute("data-state", "open");
    await flushFrame();

    expect(animate).not.toHaveBeenCalled();
  });
});
