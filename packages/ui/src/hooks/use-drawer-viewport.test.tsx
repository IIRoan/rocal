/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

import { useDrawerViewport } from "./use-drawer-viewport";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type VisualViewportListener = () => void;

function HookProbe() {
  const { keyboardHeight, viewportStyle } = useDrawerViewport({
    responsiveHeight: "90dvh",
  });

  return (
    <div
      data-testid="viewport-probe"
      data-keyboard-height={String(keyboardHeight)}
      data-height={viewportStyle?.height}
      data-max-height={viewportStyle?.maxHeight}
      data-bottom={String(viewportStyle?.bottom ?? 0)}
    />
  );
}

describe("useDrawerViewport", () => {
  let container: HTMLDivElement;
  let root: Root;
  let listeners: Record<string, VisualViewportListener[]>;
  let originalVisualViewport: VisualViewport | undefined;
  let originalRequestAnimationFrame: typeof globalThis.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof globalThis.cancelAnimationFrame;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    listeners = { resize: [], scroll: [] };
    originalVisualViewport = window.visualViewport;
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
      writable: true,
    });

    const visualViewportMock = {
      height: 800,
      addEventListener: (event: string, listener: VisualViewportListener) => {
        listeners[event] ??= [];
        listeners[event].push(listener);
      },
      removeEventListener: (
        event: string,
        listener: VisualViewportListener,
      ) => {
        listeners[event] = (listeners[event] ?? []).filter(
          (candidate) => candidate !== listener,
        );
      },
    } as unknown as VisualViewport;

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: visualViewportMock,
    });

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame =
      (() => {}) as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });

    container.remove();

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: originalVisualViewport,
    });
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("returns a keyboard-aware bounded drawer viewport style", () => {
    act(() => {
      root.render(<HookProbe />);
    });

    const probe = container.querySelector(
      '[data-testid="viewport-probe"]',
    ) as HTMLDivElement | null;

    expect(probe?.dataset.keyboardHeight).toBe("0");
    expect(probe?.dataset.height).toBe("90dvh");
    expect(probe?.dataset.maxHeight).toBe("90dvh");
    expect(probe?.dataset.bottom).toBe("0");

    act(() => {
      (
        window.visualViewport as unknown as {
          height: number;
        }
      ).height = 560;
      listeners.resize.forEach((listener) => listener());
    });

    expect(probe?.dataset.keyboardHeight).toBe("240");
    expect(probe?.dataset.height).toBe("calc(100dvh - 240px)");
    expect(probe?.dataset.maxHeight).toBe("calc(100dvh - 240px)");
    expect(probe?.dataset.bottom).toBe("240");
  });
});
