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
import { TransitionContainer } from "@/components/command-palette/transition-container";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const animate = jest.fn(
  (_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({
    cancel: jest.fn(),
  }),
);
const motionPreference = Object.assign(new EventTarget(), { matches: false });
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  animate.mockClear();
  motionPreference.matches = false;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => motionPreference,
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: animate,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

function showPage(viewKey: string, navigationDepth: number, text = viewKey) {
  act(() =>
    root.render(
      <TransitionContainer viewKey={viewKey} navigationDepth={navigationDepth}>
        <input aria-label="Page value" defaultValue="Draft" />
        <p>{text}</p>
      </TransitionContainer>,
    ),
  );
}

function animationAt(index: number) {
  const result = animate.mock.results[index];
  if (result?.type !== "return") throw new Error("Missing animation");
  return result.value;
}

describe("palette page transitions", () => {
  it("renders the initial page without an extra entrance animation", () => {
    showPage("main", 1);
    expect(container.textContent).toBe("main");
    expect(animate).not.toHaveBeenCalled();
  });

  it("renders the destination immediately and reverses direction when going back", () => {
    showPage("main", 1);
    showPage("settings", 2);
    expect(container.textContent).toBe("settings");
    expect(animate.mock.calls[0][0]).toEqual([
      {
        opacity: 0,
        visibility: "visible",
        transform: "translate(12px, 0px) scale(1)",
      },
      { opacity: 1, visibility: "visible", transform: "none" },
    ]);
    showPage("main", 1);
    expect(animate.mock.calls[1][0][0].transform).toBe(
      "translate(-12px, 0px) scale(1)",
    );
    expect(animationAt(0).cancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[style*='height']")).toBeNull();
  });

  it("keeps live updates and input state without restarting the page animation", () => {
    showPage("main", 1);
    showPage("settings", 2);
    const input = container.querySelector("input");
    if (!input) throw new Error("Missing input");
    input.value = "Edited draft";
    showPage("settings", 2, "Updated settings");
    expect(container.textContent).toBe("Updated settings");
    expect(container.querySelector("input")?.value).toBe("Edited draft");
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animationAt(0).cancel).not.toHaveBeenCalled();
  });

  it("cancels interrupted motion and cleans up when the palette closes", () => {
    showPage("main", 1);
    showPage("settings", 2);
    showPage("composing", 3);
    expect(container.textContent).toBe("composing");
    expect(animationAt(0).cancel).toHaveBeenCalledTimes(1);
    act(() => root.render(null));
    expect(animationAt(1).cancel).toHaveBeenCalledTimes(1);
  });

  it("skips motion and cancels a running transition when reduced motion is enabled", () => {
    motionPreference.matches = true;
    showPage("main", 1);
    showPage("settings", 2);
    expect(container.textContent).toBe("settings");
    expect(animate).not.toHaveBeenCalled();
    act(() => {
      motionPreference.matches = false;
      motionPreference.dispatchEvent(new Event("change"));
    });
    expect(animate).not.toHaveBeenCalled();
    showPage("composing", 3);
    act(() => {
      motionPreference.matches = true;
      motionPreference.dispatchEvent(new Event("change"));
    });
    expect(animationAt(0).cancel).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("composing");
  });
});
