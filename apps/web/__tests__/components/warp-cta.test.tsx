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
import type { WarpProps } from "@paper-design/shaders-react";
import { WarpCta } from "../../components/landing/warp-cta";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@paper-design/shaders-react", () => ({
  Warp: ({ speed }: WarpProps) => <div data-warp data-speed={speed} />,
}));

jest.mock("lucide-react", () => ({
  ArrowRight: "svg",
  Pause: "svg",
  Play: "svg",
}));

let container: HTMLDivElement;
let root: Root;
let reducedMotion: boolean;
const motionListeners = new Set<() => void>();
const originalMatchMedia = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);
const noop = () => {};

beforeEach(() => {
  reducedMotion = false;
  motionListeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => ({
      get matches() {
        return reducedMotion;
      },
      addEventListener: (_event: string, listener: () => void) => {
        motionListeners.add(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        motionListeners.delete(listener);
      },
    })),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

function getShaderSpeed() {
  return Number(
    container.querySelector("[data-warp]")?.getAttribute("data-speed"),
  );
}

function getControl(label: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `[aria-label="${label}"]`,
  );
  if (!button) throw new Error("Background animation control is missing");
  return button;
}

describe("WarpCta", () => {
  it("labels the strip, keeps it dark in both themes and hides the shader", () => {
    act(() => root.render(<WarpCta onAction={noop} isLeaving={false} />));

    const section = container.querySelector("section");
    const heading = container.querySelector("h2");
    expect(heading?.textContent).toBe("Access by invitation.");
    expect(section?.getAttribute("aria-labelledby")).toBe(heading?.id);
    expect(section?.classList.contains("dark")).toBe(true);
    expect(
      container.querySelector("[data-warp]")?.closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  });

  it("keeps the shader still until the strip has painted", async () => {
    act(() => root.render(<WarpCta onAction={noop} isLeaving={false} />));
    expect(getShaderSpeed()).toBe(0);

    await nextFrame();
    expect(getShaderSpeed()).toBe(0);
    await nextFrame();
    expect(getShaderSpeed()).toBeGreaterThan(0);
  });

  it("lets visitors pause and resume the shader", async () => {
    act(() => root.render(<WarpCta onAction={noop} isLeaving={false} />));
    await nextFrame();
    await nextFrame();

    act(() => getControl("Pause background animation").click());
    expect(getShaderSpeed()).toBe(0);
    act(() => getControl("Play background animation").click());
    expect(getShaderSpeed()).toBeGreaterThan(0);
  });

  it("uses the page's sign-in action and prevents repeated navigation", () => {
    const onAction = jest.fn();
    act(() => root.render(<WarpCta onAction={onAction} isLeaving={false} />));
    const button = container.querySelector<HTMLButtonElement>("button");
    if (!button) throw new Error("Sign-in action is missing");

    act(() => button.click());
    expect(onAction).toHaveBeenCalledTimes(1);

    act(() => root.render(<WarpCta onAction={onAction} isLeaving />));
    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("honors reduced motion on load and when the system preference changes", async () => {
    reducedMotion = true;
    act(() => root.render(<WarpCta onAction={noop} isLeaving={false} />));
    await nextFrame();
    await nextFrame();

    expect(getShaderSpeed()).toBe(0);
    expect(
      container.querySelector('[aria-label="Pause background animation"]'),
    ).toBeNull();

    act(() => {
      reducedMotion = false;
      motionListeners.forEach((listener) => listener());
    });
    expect(getShaderSpeed()).toBeGreaterThan(0);

    act(() => {
      reducedMotion = true;
      motionListeners.forEach((listener) => listener());
    });
    expect(getShaderSpeed()).toBe(0);
    expect(
      container.querySelector('[aria-label="Pause background animation"]'),
    ).toBeNull();
  });
});
