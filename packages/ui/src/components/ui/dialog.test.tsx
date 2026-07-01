/** @jest-environment jsdom */

import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

jest.mock("lucide-react", () => ({
  XIcon: () => null,
}));

import { Dialog, DialogContent, DialogTitle } from "./dialog";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("DialogContent spotlight variant", () => {
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

  it("positions spotlight dialogs in the upper viewport", () => {
    act(() => {
      root.render(
        <Dialog open>
          <DialogContent
            variant="spotlight"
            showClose={false}
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Command Palette</DialogTitle>
            palette
          </DialogContent>
        </Dialog>,
      );
    });

    const content = document.querySelector<HTMLElement>(
      "[data-slot='dialog-content'][data-variant='spotlight']",
    );

    expect(content).not.toBeNull();
    expect(content?.className).toContain("left-1/2");
    expect(content?.className).toContain("top-[10%]");
    expect(content?.className).toContain("-translate-x-1/2");
    // Spotlight does NOT vertically center — keeps the command palette near
    // the top of the viewport. Guard against accidental re-centering.
    expect(content?.className).not.toContain("-translate-y-1/2");
  });

  it("keeps centered dialogs centered in the viewport", () => {
    act(() => {
      root.render(
        <Dialog open>
          <DialogContent
            variant="center"
            showClose={false}
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Settings</DialogTitle>
            content
          </DialogContent>
        </Dialog>,
      );
    });

    const content = document.querySelector<HTMLElement>(
      "[data-slot='dialog-content'][data-variant='center']",
    );

    expect(content).not.toBeNull();
    expect(content?.className).toContain("left-1/2");
    expect(content?.className).toContain("top-1/2");
    expect(content?.className).toContain("-translate-x-1/2");
    expect(content?.className).toContain("-translate-y-1/2");
    expect(content?.className).toContain("dialog-center-animation");
  });

  it("uses the dedicated spotlight animation instead of generic transform classes", () => {
    act(() => {
      root.render(
        <Dialog open>
          <DialogContent
            variant="spotlight"
            showClose={false}
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">Command Palette</DialogTitle>
            palette
          </DialogContent>
        </Dialog>,
      );
    });

    const content = document.querySelector<HTMLElement>(
      "[data-slot='dialog-content'][data-variant='spotlight']",
    );

    expect(content).not.toBeNull();
    expect(content?.className).toContain("dialog-spotlight-animation");
    expect(content?.className).not.toContain("animate-in");
    expect(content?.className).not.toContain("slide-in-from-top-4");
    expect(content?.className).not.toContain("zoom-in-95");
  });
});

/**
 * Source-level guard. Tailwind v4 emits the centering offset on the native
 * `translate` CSS property; if the dialog keyframes ever animate `transform`
 * or `translate` again they will compose with that and visibly knock the
 * dialog off-center. This catches that regression without needing a real
 * browser.
 */
describe("dialog centered animation keyframes", () => {
  const stylesheets = [
    join(__dirname, "../../styles/globals.css"),
    join(__dirname, "../../../../../apps/web/app/globals.css"),
  ];

  const extractKeyframeBlock = (css: string, name: string) => {
    const pattern = new RegExp(
      `@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
      "m",
    );
    const match = css.match(pattern);
    return match ? match[1] : null;
  };

  for (const stylesheet of stylesheets) {
    describe(stylesheet, () => {
      const css = readFileSync(stylesheet, "utf8");

      it("never references removed broken keyframes", () => {
        for (const removedKeyframe of [
          "spotlightSlideDown",
          "spotlightSlideUp",
          "spotlightCenterEnter",
          "spotlightCenterExit",
          "centerEnter",
          "centerExit",
        ]) {
          expect(css).not.toContain(`@keyframes ${removedKeyframe}`);
        }
      });

      for (const keyframeName of [
        "dialogCenteredEnter",
        "dialogCenteredExit",
      ]) {
        it(`${keyframeName} only animates opacity and scale (never transform/translate)`, () => {
          const block = extractKeyframeBlock(css, keyframeName);
          expect(block).not.toBeNull();
          expect(block).not.toMatch(/\btransform\s*:/);
          expect(block).not.toMatch(/\btranslate\s*:/);
          expect(block).toMatch(/\bscale\s*:/);
          expect(block).toMatch(/\bopacity\s*:/);
        });
      }
    });
  }
});
