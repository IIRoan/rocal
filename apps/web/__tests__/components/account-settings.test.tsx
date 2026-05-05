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
    Lock: Icon,
    Loader2: Icon,
    ImageIcon: Icon,
    Pencil: Icon,
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

  it("renders account info and delete-account confirmation flow", async () => {
    const handleDeleteAccount = jest.fn();
    const handleChangePassword = jest.fn<() => Promise<void>>(
      async () => undefined,
    );

    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={handleDeleteAccount}
          accountName="Roan"
          accountEmail="roan@example.com"
          accountImage={null}
          sessionLoading={false}
          changingPassword={false}
          handleChangePassword={handleChangePassword}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Roan");
    expect(container.textContent).toContain("roan@example.com");
    expect(container.textContent).toContain("Change Password");

    const openDeleteButton = Array.from(
      container.querySelectorAll("button"),
    ).find((el) => el.textContent?.includes("Delete Account"));
    expect(openDeleteButton).toBeDefined();

    await act(async () => {
      openDeleteButton?.click();
      await Promise.resolve();
    });

    const confirmDeleteButton = Array.from(
      container.querySelectorAll("button"),
    ).find((el) => el.textContent?.includes("Delete my account"));
    expect(confirmDeleteButton).toBeDefined();

    await act(async () => {
      confirmDeleteButton?.click();
      await Promise.resolve();
    });

    expect(handleDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("shows loading skeleton while session is loading", async () => {
    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={() => {}}
          accountName={null}
          accountEmail={null}
          sessionLoading={true}
          changingPassword={false}
          handleChangePassword={async () => {}}
        />,
      );
      await Promise.resolve();
    });

    // Should not show "Email unavailable" while loading
    expect(container.textContent).not.toContain("Email unavailable");
  });
});
