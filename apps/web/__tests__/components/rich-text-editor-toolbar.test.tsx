/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import type { Editor } from "@tiptap/react";
import { RichTextEditorToolbar } from "../../components/mail/rich-text-editor-toolbar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

jest.mock("@workspace/ui/components/ui/tooltip", () => ({
  SimpleTooltip: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
}));

const chain: Record<string, () => unknown> = new Proxy(
  {},
  { get: (_target, key) => (key === "run" ? () => true : () => chain) },
);

// The toolbar reads only these members; a full tiptap editor needs a DOM layout jsdom lacks.
const editor = {
  isActive: (name: string) => name === "bold",
  can: () => ({ undo: () => false, redo: () => true }),
  chain: () => chain,
  on: jest.fn(),
  off: jest.fn(),
  state: { selection: { from: 1, to: 1, empty: true } },
  getAttributes: () => ({}),
} as unknown as Editor;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <RichTextEditorToolbar editor={editor} disabled={false} onClose={jest.fn()} />,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function named(label: string) {
  const element = container.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing ${label}`);
  return element;
}

function press(key: string) {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
}

describe("RichTextEditorToolbar", () => {
  it("exposes toggle state with aria-pressed", () => {
    expect(named("Bold").getAttribute("aria-pressed")).toBe("true");
    expect(named("Italic").getAttribute("aria-pressed")).toBe("false");
    expect(named("Undo").hasAttribute("aria-pressed")).toBe(false);
  });

  it("is one Tab stop and moves focus with arrow keys, Home and End", () => {
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute("aria-label")).toBe("Formatting");
    expect(
      Array.from(toolbar?.querySelectorAll("button") ?? []).filter(
        (button) => button.tabIndex === 0,
      ),
    ).toEqual([named("Bold")]);

    act(() => named("Bold").focus());
    press("ArrowRight");
    expect(document.activeElement).toBe(named("Italic"));
    press("End");
    expect(document.activeElement).toBe(named("Redo"));
    press("ArrowRight");
    expect(document.activeElement).toBe(named("Bold"));
    press("ArrowLeft");
    expect(document.activeElement).toBe(named("Redo"));
    press("Home");
    expect(document.activeElement).toBe(named("Bold"));
  });
});
