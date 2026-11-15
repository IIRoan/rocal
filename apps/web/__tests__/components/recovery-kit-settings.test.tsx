/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { RECOVERY_KIT_NOTICE } from "@workspace/calendar-core/product-info";
import { RecoveryKitSettings } from "../../components/command-palette/recovery-kit-settings";

const MOCK_RECOVERY_KEY = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789";
const mockCreate = jest.fn(async (_password: string) => MOCK_RECOVERY_KEY);

jest.mock("lucide-react", () =>
  new Proxy({}, { get: () => () => null }),
);

jest.mock("../../hooks/use-recovery-kit", () => ({
  useRecoveryKit: () => ({
    status: { isPending: false, isError: false, data: { exists: false } },
    create: mockCreate,
    remove: { isPending: false, mutateAsync: jest.fn() },
  }),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  mockCreate.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RecoveryKitSettings />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function button(label: string) {
  return Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(label),
  );
}

async function click(element: Element | undefined) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

it("shows a new key once behind the current password, and keeps it only until saved", async () => {
  const storageWrites = jest.spyOn(Storage.prototype, "setItem");
  expect(container.textContent).toContain("Not set up");

  await click(button("Recovery kit"));
  const password = container.querySelector<HTMLInputElement>("input[type='password']");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      password,
      "current-secret-pw",
    );
    password?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(mockCreate).toHaveBeenCalledWith("current-secret-pw");
  expect(container.textContent).toContain(MOCK_RECOVERY_KEY);
  expect(container.textContent).toContain(RECOVERY_KIT_NOTICE);
  expect(button("Done")?.disabled).toBe(true);

  await click(container.querySelector("[role='checkbox']") ?? undefined);
  expect(button("Done")?.disabled).toBe(false);
  await click(button("Done"));

  expect(container.textContent).not.toContain(MOCK_RECOVERY_KEY);
  expect(document.body.textContent).not.toContain(MOCK_RECOVERY_KEY);
  expect(storageWrites).not.toHaveBeenCalled();
});

it("asks for the password before creating anything", async () => {
  await click(button("Recovery kit"));
  await act(async () => {
    container
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  expect(mockCreate).not.toHaveBeenCalled();
  expect(container.querySelector("[role='alert']")?.textContent).toBe(
    "Enter your current password.",
  );
});
