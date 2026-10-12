/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFadeInAfterPaint } from "./use-fade-in-after-paint";

let mockReducedMotion = false;

jest.mock("react-native-reanimated", () => {
  const { useRef } = jest.requireActual<typeof import("react")>("react");
  return {
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial: number) => useRef({ value: initial }).current,
    withTiming: (target: number) => target,
    // Reads the worklet lazily so the test sees the shared value after frames run.
    useAnimatedStyle: (worklet: () => { opacity: number }) => ({
      get opacity() {
        return worklet().opacity;
      },
    }),
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type FadeStyle = ReturnType<typeof useFadeInAfterPaint>;

let style: FadeStyle | null = null;

function Harness({ visible, onRender }: { visible: boolean; onRender: (fade: FadeStyle) => void }) {
  const fade = useFadeInAfterPaint(200, visible);
  useEffect(() => onRender(fade));
  return null;
}

function capture(fade: FadeStyle) {
  style = fade;
}

function render(visible: boolean) {
  act(() => root.render(<Harness visible={visible} onRender={capture} />));
}

function opacity() {
  if (!style) throw new Error("Harness has not rendered");
  return Reflect.get(style, "opacity");
}

const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockReducedMotion = false;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useFadeInAfterPaint", () => {
  it("stays hidden through the render frame and fades in once painted", async () => {
    render(true);
    expect(opacity()).toBe(0);

    await nextFrame();
    expect(opacity()).toBe(0);
    await nextFrame();
    expect(opacity()).toBe(1);
  });

  it("starts hidden again each time the content reappears", async () => {
    render(true);
    await nextFrame();
    await nextFrame();

    render(false);
    expect(opacity()).toBe(0);
    render(true);
    await nextFrame();
    expect(opacity()).toBe(0);
    await nextFrame();
    expect(opacity()).toBe(1);
  });

  it("shows content at once under reduced motion", () => {
    mockReducedMotion = true;
    render(true);
    expect(opacity()).toBe(1);
  });
});
