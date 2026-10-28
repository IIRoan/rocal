/** @jest-environment jsdom */
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Alert, Linking } from "react-native";
import { AppInformationSettingsSection } from "./AppInformationSettingsSection";
import { AppInformationLinks } from "../AppInformationLinks";

let mockAppUrl: string | null = "https://preview.example.test";
jest.mock("../../lib/constants", () => ({
  get APP_BASE_URL() {
    return mockAppUrl;
  },
}));
jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityRole,
  }: {
    children: ReactNode;
    onPress: () => void;
    accessibilityRole: string;
  }) => (
    <button role={accessibilityRole} onClick={onPress}>
      {children}
    </button>
  ),
}));
jest.mock("../../providers/ThemeProvider", () => {
  const { nativeLightTheme } = jest.requireActual<
    typeof import("@workspace/design-tokens")
  >("@workspace/design-tokens");
  return { useTheme: () => ({ theme: nativeLightTheme }) };
});
jest.mock("../sheet/SheetSections", () => ({
  SheetSection: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  SheetGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetItem: ({
    label,
    onPress,
    accessibilityRole,
  }: {
    label: string;
    onPress: () => void;
    accessibilityRole: string;
  }) => (
    <button role={accessibilityRole} onClick={onPress}>
      {label}
    </button>
  ),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockAppUrl = "https://preview.example.test";
  jest.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe("shared app information", () => {
  it("makes policy and support available on auth screens without a session provider", async () => {
    act(() => root.render(<AppInformationLinks />));
    const links =
      container.querySelectorAll<HTMLButtonElement>('[role="link"]');
    expect(Array.from(links).map((link) => link.textContent)).toEqual([
      "Privacy policy",
      "Support",
    ]);
    await act(async () => {
      links[0]?.click();
      links[1]?.click();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://preview.example.test/privacy",
    );
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://preview.example.test/support",
    );
  });
  it("opens privacy and support at this build's configured origin", async () => {
    act(() => root.render(<AppInformationSettingsSection />));
    const links =
      container.querySelectorAll<HTMLButtonElement>('[role="link"]');
    expect(
      Array.from(links)
        .slice(0, 2)
        .map((link) => link.textContent),
    ).toEqual(["Privacy policy", "Support"]);
    await act(async () => {
      links[0]?.click();
      links[1]?.click();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://preview.example.test/privacy",
    );
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://preview.example.test/support",
    );
  });

  it("handles browser failures without an unhandled rejection", async () => {
    jest.mocked(Linking.openURL).mockRejectedValueOnce(new Error("No handler"));
    act(() => root.render(<AppInformationSettingsSection />));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[role="link"]')?.click(),
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      "Could not open link",
      "Please try again.",
    );
  });

  it("omits the section when no valid website is configured", () => {
    mockAppUrl = null;
    act(() => root.render(<AppInformationSettingsSection />));
    expect(container.textContent).toBe("");
  });
});
