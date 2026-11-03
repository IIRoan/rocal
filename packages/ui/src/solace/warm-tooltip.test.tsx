/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot } from "react-dom/client";

import { WarmTooltip } from "./warm-tooltip";

jest.mock("./warm-tooltip.css", () => ({}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function movePointer(type: "pointerover" | "pointerout", target: Element, relatedTarget: Element | null) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }));
}

function tooltip() {
  return document.body.querySelector('[role="tooltip"]');
}

describe("WarmTooltip", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("stays open while the pointer is on the tooltip and closes once it leaves", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      createRoot(container).render(
        <WarmTooltip content="Archive" delay={0}>
          <button type="button">Archive</button>
        </WarmTooltip>,
      );
    });
    const trigger = container.querySelector(".warm-tooltip__trigger");
    if (!trigger) throw new Error("missing trigger");

    act(() => {
      movePointer("pointerover", trigger, null);
      jest.advanceTimersByTime(0);
    });
    const content = tooltip();
    if (!content) throw new Error("tooltip did not open");

    act(() => {
      movePointer("pointerout", trigger, content);
      movePointer("pointerover", content, trigger);
      jest.advanceTimersByTime(1000);
    });
    expect(tooltip()).not.toBeNull();

    act(() => {
      movePointer("pointerout", content, document.body);
      jest.advanceTimersByTime(1000);
    });
    expect(tooltip()).toBeNull();
  });
});
