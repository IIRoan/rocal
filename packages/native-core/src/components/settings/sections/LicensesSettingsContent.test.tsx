/** @jest-environment jsdom */
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Linking } from "react-native";
import { THIRD_PARTY_LICENSE_GROUPS } from "@workspace/calendar-core/third-party-notices";
import { LicensesSettingsContent } from "./LicensesSettingsContent";

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
jest.mock("../../../providers/ThemeProvider", () => {
  const { nativeLightTheme } = jest.requireActual<
    typeof import("@workspace/design-tokens")
  >("@workspace/design-tokens");
  return { useTheme: () => ({ theme: nativeLightTheme }) };
});
jest.mock("../SettingsPage", () => ({
  SettingsPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
jest.mock("../../sheet/SheetSections", () => ({
  SheetScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetGroupBlock: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SheetSection: ({
    footer,
    children,
  }: {
    footer?: string;
    children: ReactNode;
  }) => (
    <section>
      {children}
      <p>{footer}</p>
    </section>
  ),
  SheetItem: ({
    label,
    detail,
    onPress,
    accessibilityState,
  }: {
    label: string;
    detail?: string;
    onPress: () => void;
    accessibilityState?: { expanded?: boolean };
  }) => (
    <button aria-expanded={accessibilityState?.expanded} onClick={onPress}>
      {[label, detail].filter(Boolean).join(" ")}
    </button>
  ),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(<LicensesSettingsContent />));
});
afterEach(() => act(() => root.unmount()));

function groupRow(index: number): HTMLButtonElement {
  const row = container.querySelectorAll<HTMLButtonElement>(
    "button[aria-expanded]",
  )[index];
  if (!row) throw new Error(`No license group row ${index}`);
  return row;
}

function group(index: number) {
  const entry = THIRD_PARTY_LICENSE_GROUPS[index];
  if (!entry) throw new Error(`No license group ${index}`);
  return entry;
}

describe("open source licenses page", () => {
  it("states the AGPL license and links to the source code", async () => {
    expect(container.textContent).toContain(
      "GNU Affero General Public License",
    );
    const source = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Source code",
    );
    await act(async () => source?.click());
    expect(Linking.openURL).toHaveBeenCalledWith(
      "https://github.com/IIRoan/rocal",
    );
  });

  it("lists every license group collapsed", () => {
    expect(container.querySelectorAll("button[aria-expanded]").length).toBe(
      THIRD_PARTY_LICENSE_GROUPS.length,
    );
    expect(container.textContent).not.toContain(group(0).text);
  });

  it("shows one group's packages, copyright notices and license at a time", () => {
    act(() => groupRow(0).click());
    expect(groupRow(0).getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(group(0).text);
    expect(container.textContent).toContain(group(0).packages[0]?.name);
    const copyright = group(0).packages.find((pkg) => pkg.copyright[0])
      ?.copyright[0];
    expect(copyright).toBeTruthy();
    expect(container.textContent).toContain(copyright);

    act(() => groupRow(1).click());
    expect(groupRow(0).getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain(group(0).text);
    expect(container.textContent).toContain(group(1).text);

    act(() => groupRow(1).click());
    expect(container.textContent).not.toContain(group(1).text);
  });
});
