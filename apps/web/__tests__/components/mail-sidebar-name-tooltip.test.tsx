/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

import { TruncatedNameTooltip } from "../../components/mail/mail-sidebar-labels";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderName(name: string, scrollWidth: number) {
  act(() =>
    root.render(
      <TruncatedNameTooltip name={name}>
        <button type="button">
          <span data-sidebar-name>{name}</span>
        </button>
      </TruncatedNameTooltip>,
    ),
  );
  const label = container.querySelector("[data-sidebar-name]");
  if (!label) throw new Error("Missing label");
  Object.defineProperty(label, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(label, "scrollWidth", { configurable: true, value: scrollWidth });
  const button = container.querySelector("button");
  if (!button) throw new Error("Missing button");
  act(() => button.focus());
  return button;
}

describe("TruncatedNameTooltip", () => {
  it("shows the full name on keyboard focus when the name is cut short", () => {
    const button = renderName("Receipts and invoices from 2025", 240);
    expect(button.getAttribute("data-state")).not.toBe("closed");
    expect(button.textContent).toBe("Receipts and invoices from 2025");
    expect(document.body.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
      "Receipts and invoices from 2025",
    );
  });

  it("stays closed when the whole name fits", () => {
    const button = renderName("Receipts", 100);
    expect(button.getAttribute("data-state")).toBe("closed");
  });
});
