/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { EventDeleteConfirmDialog } from "../../components/event-editor/event-delete-confirm-dialog";

jest.mock("lucide-react", () => ({
  XIcon: () => null,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const classesOf = (selector: string) =>
  document.querySelector(selector)?.className.split(" ") ?? [];

it("insets the title, description and buttons from the dialog edges", async () => {
  await act(async () =>
    root.render(
      <EventDeleteConfirmDialog
        eventTitle="Planning"
        onConfirm={jest.fn()}
        onOpenChange={jest.fn()}
        open
        removeOnly={false}
      />,
    ),
  );

  const content = document.querySelector("[data-slot='dialog-content']");
  const header = document.querySelector("[data-slot='dialog-header']");
  const footer = document.querySelector("[data-slot='dialog-footer']");

  expect(header?.parentElement).toBe(content);
  expect(footer?.parentElement).toBe(content);
  expect(header?.textContent).toContain("Delete “Planning”?");
  expect(header?.textContent).toContain("You can’t undo this.");
  expect(footer?.textContent).toContain("Delete event");
  expect(classesOf("[data-slot='dialog-header']")).toEqual(
    expect.arrayContaining(["px-5", "pt-5", "pb-3"]),
  );
  expect(classesOf("[data-slot='dialog-footer']")).toEqual(
    expect.arrayContaining(["px-5", "py-4"]),
  );
});
