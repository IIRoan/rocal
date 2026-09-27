/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  buildPasskeyCommandActions,
  buildSettingsCommandActions,
  buildThemeCommandActions,
} from "../lib/command-palette-common";
import { useCommonCommandActions } from "./use-common-command-actions";

const mockPush = jest.fn();
const mockRegisterPasskey = jest.fn();
const mockSetThemePreference = jest.fn();
const mockToast = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({ registerPasskey: mockRegisterPasskey }),
}));

jest.mock("../providers/ThemeProvider", () => ({
  useTheme: () => ({ setThemePreference: mockSetThemePreference }),
}));

jest.mock("../providers/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type Runner = ReturnType<typeof useCommonCommandActions>;

let run: Runner | null = null;

function Harness({ onReady }: { onReady: (runner: Runner) => void }) {
  const runner = useCommonCommandActions();
  useEffect(() => onReady(runner), [onReady, runner]);
  return null;
}

function captureRunner(runner: Runner) {
  run = runner;
}

function getRunner() {
  if (!run) throw new Error("Harness not rendered");
  return run;
}

describe("useCommonCommandActions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    root = createRoot(container);
    act(() => {
      root.render(<Harness onReady={captureRunner} />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    run = null;
  });

  it("applies theme on this device only", () => {
    const dark = buildThemeCommandActions().find((a) => a.id === "theme-dark");
    expect(dark && getRunner()(dark)).toBe(true);
    expect(mockSetThemePreference).toHaveBeenCalledWith("dark");
  });

  it("opens settings sections by route", () => {
    const [account] = buildSettingsCommandActions(
      [{ id: "account", label: "Account", description: "Profile" }],
      { account: "user" },
    );
    expect(account && getRunner()(account)).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/settings/account");
  });

  it("sends passkey deletion to Security settings", () => {
    const deletePasskey = buildPasskeyCommandActions().find(
      (a) => a.id === "delete-passkey",
    );
    expect(deletePasskey && getRunner()(deletePasskey)).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/settings/security");
  });

  it("registers a passkey through the auth provider and confirms it", async () => {
    mockRegisterPasskey.mockResolvedValueOnce(undefined);
    const addPasskey = buildPasskeyCommandActions().find(
      (a) => a.id === "add-passkey",
    );
    await act(async () => {
      expect(addPasskey && getRunner()(addPasskey)).toBe(true);
    });
    expect(mockRegisterPasskey).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith("Passkey added");
  });

  it("reports passkey registration failures as an error toast", async () => {
    mockRegisterPasskey.mockRejectedValueOnce(new Error("Passkey setup was cancelled."));
    const addPasskey = buildPasskeyCommandActions().find(
      (a) => a.id === "add-passkey",
    );
    await act(async () => {
      if (addPasskey) getRunner()(addPasskey);
    });
    expect(mockToast).toHaveBeenCalledWith(
      "Passkey setup was cancelled.",
      "error",
    );
  });

  it("leaves app-specific actions to the caller", () => {
    expect(getRunner()({ id: "new-event" })).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
