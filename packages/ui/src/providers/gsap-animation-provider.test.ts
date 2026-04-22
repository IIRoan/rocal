/** @jest-environment jsdom */

import { describe, expect, it } from "@jest/globals";

import { shouldPreserveTransformAnimation } from "./gsap-animation-provider";

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
