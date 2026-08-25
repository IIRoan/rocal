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
import type { NativePasskeyBridgeActionResult } from "@/lib/native-passkey-bridge-action";

const mockRunNativePasskeyBridgeAction = jest.fn(
  async (): Promise<NativePasskeyBridgeActionResult> => ({
    status: "error",
    message: "not mocked",
  }),
);

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    Key: Icon,
  };
});

jest.mock("@workspace/ui/components/layout", () => ({
  Logo: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>Solace</div>
  ),
  ThemeToggle: () => <button type="button">Theme</button>,
}));

jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/lib/native-passkey-bridge-action", () => ({
  runNativePasskeyBridgeAction: mockRunNativePasskeyBridgeAction,
}));

import NativePasskeyBridgePage from "../../app/passkey/native/page";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function setBridgeSearch(search: string) {
  window.history.replaceState({}, "", `/passkey/native${search}`);
}

describe("NativePasskeyBridgePage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockRunNativePasskeyBridgeAction.mockReset();
    mockRunNativePasskeyBridgeAction.mockImplementation(
      async () =>
        new Promise(() => {
          // Leave the native sign-in prompt open until a test resolves it.
        }),
    );
    setBridgeSearch(
      "?mode=sign-in&callbackURL=solace%3A%2F%2Fcalendar&bridgeToken=token-1",
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it("renders the Solace auth layout instead of a generic card", async () => {
    await act(async () => {
      root.render(<NativePasskeyBridgePage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Solace");
    expect(container.textContent).toContain("Confirm it's you");
    expect(container.textContent).toContain(
      "Finish signing in with your passkey.",
    );
    expect(container.textContent).toContain("Waiting for your passkey…");
    expect(container.textContent).not.toContain("Try again");
    expect(container.textContent).toContain("Cancel and return to the app");
  });

  it("starts passkey verification automatically after password sign-in", async () => {
    mockRunNativePasskeyBridgeAction.mockImplementation(
      async () =>
        new Promise(() => {
          // Keep the prompt open for this assertion.
        }),
    );

    await act(async () => {
      root.render(<NativePasskeyBridgePage />);
      await Promise.resolve();
    });

    expect(mockRunNativePasskeyBridgeAction).toHaveBeenCalled();
    expect(container.textContent).toContain("Waiting for your passkey…");
  });

  it("shows a clean cancelled notice when the browser passkey prompt is dismissed", async () => {
    mockRunNativePasskeyBridgeAction.mockResolvedValue({
      status: "cancelled",
      message: "Passkey authentication was cancelled.",
    });

    await act(async () => {
      root.render(<NativePasskeyBridgePage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Passkey authentication was cancelled.",
    );
    expect(container.textContent).toContain("Try again");
    expect(container.querySelector("[role='alert']")).toBeNull();
  });
});
