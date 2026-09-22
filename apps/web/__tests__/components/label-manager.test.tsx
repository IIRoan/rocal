/** @jest-environment jsdom */

import React, { act, useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("lucide-react", () =>
  new Proxy({}, { get: () => () => null }),
);

import {
  LabelManager,
  type LabelManagerView,
} from "../../components/mail/label-manager";
import type { LabelDef } from "../../lib/mail/types";

const labels = [{ id: "l1", name: "Work", color: "#3b82f6" }] as LabelDef[];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Harness(props: {
  onCreateLabel: (name: string, color: string) => Promise<LabelDef | null>;
  onUpdateLabel: (id: string, updates: { name: string; color: string }) => Promise<void>;
  onDeleteLabel: (id: string) => Promise<void>;
}) {
  const [stack, setStack] = useState<LabelManagerView[]>(["labels"]);
  return (
    <LabelManager
      labels={labels}
      currentView={stack[stack.length - 1]}
      onBack={() => setStack((s) => s.slice(0, -1))}
      onNavigateTo={(view) => setStack((s) => [...s, view])}
      {...props}
    />
  );
}

function button(text: string) {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement;
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("LabelManager", () => {
  it("creates a label with the chosen name and color, then returns to the list", async () => {
    const onCreateLabel = jest.fn(async () => null);
    act(() => {
      root.render(
        <Harness
          onCreateLabel={onCreateLabel}
          onUpdateLabel={jest.fn(async () => undefined)}
          onDeleteLabel={jest.fn(async () => undefined)}
        />,
      );
    });

    act(() => button("New label").click());
    act(() => typeInto(container.querySelector("#label-name")!, "  Travel  "));
    act(() => (container.querySelector('[aria-label="Red"]') as HTMLButtonElement).click());
    await act(async () => button("Create").click());

    expect(onCreateLabel).toHaveBeenCalledWith("Travel", "#ef4444");
    expect(container.textContent).toContain("Work");
  });

  it("requires a second click to delete a label", async () => {
    const onDeleteLabel = jest.fn(async () => undefined);
    act(() => {
      root.render(
        <Harness
          onCreateLabel={jest.fn(async () => null)}
          onUpdateLabel={jest.fn(async () => undefined)}
          onDeleteLabel={onDeleteLabel}
        />,
      );
    });

    act(() => button("Work").click());
    act(() => button("Delete label").click());
    expect(onDeleteLabel).not.toHaveBeenCalled();
    await act(async () => button("Confirm delete").click());
    expect(onDeleteLabel).toHaveBeenCalledWith("l1");
  });

  it("shows an error in the form when saving fails", async () => {
    act(() => {
      root.render(
        <Harness
          onCreateLabel={jest.fn(async () => {
            throw new Error("boom");
          })}
          onUpdateLabel={jest.fn(async () => undefined)}
          onDeleteLabel={jest.fn(async () => undefined)}
        />,
      );
    });

    act(() => button("New label").click());
    act(() => typeInto(container.querySelector("#label-name")!, "Travel"));
    await act(async () => button("Create").click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Something went wrong",
    );
    expect(container.querySelector("#label-name")).not.toBeNull();
  });
});
