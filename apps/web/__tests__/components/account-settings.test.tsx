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

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    RotateCcw: Icon,
    Check: Icon,
    X: Icon,
    ArrowLeft: Icon,
    AlertTriangle: Icon,
    Trash2: Icon,
  };
});

import { AccountSettings } from "../../components/command-palette/account-settings";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("AccountSettings", () => {
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

  it("renders a delete-account confirmation flow", async () => {
    const handleDeleteAccount = jest.fn();

    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={handleDeleteAccount}
        />,
      );

      await Promise.resolve();
    });

    const openDeleteButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Delete Account"),
    );
    expect(openDeleteButton).toBeDefined();

    await act(async () => {
      openDeleteButton?.click();
      await Promise.resolve();
    });

    const confirmDeleteButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("Yes, Delete My Account"));

    expect(confirmDeleteButton).toBeDefined();
    await act(async () => {
      confirmDeleteButton?.click();
      await Promise.resolve();
    });

    expect(handleDeleteAccount).toHaveBeenCalledTimes(1);
  });
});
