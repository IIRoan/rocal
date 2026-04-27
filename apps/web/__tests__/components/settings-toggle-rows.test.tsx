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
    ArrowLeft: Icon,
    ChevronRight: Icon,
    Key: Icon,
    Mail: Icon,
    Shield: Icon,
  };
});

import { NotificationSettings } from "../../components/command-palette/notification-settings";
import { SecuritySettings } from "../../components/command-palette/security-settings";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("settings toggle rows", () => {
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

  it("renders security encryption as a single switch control without nested buttons", async () => {
    const updateSetting = jest.fn();

    await act(async () => {
      root.render(
        <SecuritySettings
          localSettings={{ eventEncryptionMode: "hybrid" } as any}
          updateSetting={updateSetting}
          goBack={() => {}}
          goForward={() => {}}
        />,
      );

      await Promise.resolve();
    });

    const toggle = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Full Event Encryption"),
    );

    expect(toggle).toBeDefined();
    expect(toggle?.getAttribute("role")).toBe("switch");
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
    expect(toggle?.querySelector("button")).toBeNull();

    toggle?.click();

    expect(updateSetting).toHaveBeenCalledWith("eventEncryptionMode", "full");
  });

  it("renders notification email toggle as a single switch control without nested buttons", async () => {
    const updateSetting = jest.fn();

    await act(async () => {
      root.render(
        <NotificationSettings
          localSettings={{
            emailNotifications: true,
            eventEncryptionMode: "hybrid",
          } as any}
          updateSetting={updateSetting}
          goBack={() => {}}
        />,
      );

      await Promise.resolve();
    });

    const toggle = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Email Notifications"),
    );

    expect(toggle).toBeDefined();
    expect(toggle?.getAttribute("role")).toBe("switch");
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(toggle?.querySelector("button")).toBeNull();

    toggle?.click();

    expect(updateSetting).toHaveBeenCalledWith("emailNotifications", false);
  });
});