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

jest.mock("../../hooks/use-passkeys", () => ({
  usePasskeys: jest.fn(),
  useAddPasskey: jest.fn(),
  useDeletePasskey: jest.fn(),
}));

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

import {
  useAddPasskey,
  useDeletePasskey,
  usePasskeys,
} from "../../hooks/use-passkeys";
import { PasskeySettings } from "../../components/passkey-settings";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const deletePasskey = jest.fn();
const addPasskey = jest.fn();

function findButton(text: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (element) =>
      element.textContent?.trim() === text ||
      element.getAttribute("aria-label") === text,
  );
}

describe("PasskeySettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.mocked(usePasskeys).mockReturnValue({
      data: [{ id: "pk-1", name: "YubiKey", createdAt: "2026-10-01" }],
      isLoading: false,
    } as any);
    jest
      .mocked(useAddPasskey)
      .mockReturnValue({ mutate: addPasskey, isPending: false } as any);
    jest
      .mocked(useDeletePasskey)
      .mockReturnValue({ mutate: deletePasskey, isPending: false } as any);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks before deleting a passkey and names it", async () => {
    await act(async () => {
      root.render(<PasskeySettings open onBack={() => {}} />);
    });

    act(() => findButton("Delete YubiKey")?.click());
    expect(deletePasskey).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Delete “YubiKey”?");

    act(() => findButton("Delete passkey")?.click());
    expect(deletePasskey).toHaveBeenCalledWith("pk-1");
  });

  it("explains a missing name instead of disabling Create passkey", async () => {
    await act(async () => {
      root.render(<PasskeySettings open startInAddMode onBack={() => {}} />);
    });

    const create = findButton("Create passkey");
    expect(create?.disabled).toBe(false);
    act(() => create?.click());

    expect(addPasskey).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Enter a name for this passkey",
    );
    expect(
      container.querySelector("#passkey-name")?.getAttribute("aria-invalid"),
    ).toBe("true");
  });
});
