/** @jest-environment jsdom */
import React, { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { SpecialSettingsContent } from "./SpecialSettingsContent";

const mockNavigate = jest.fn();

jest.mock("@workspace/native-core/components/settings/SettingsPage", () => ({
  SettingsPage: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  useSettingsNavigator: () => mockNavigate,
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => {
  const Slot = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    SheetScroll: Slot,
    SheetSection: Slot,
    SheetGroup: Slot,
    SheetItem: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("opens Riftbound inside the Special page", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<SpecialSettingsContent />));
  act(() => container.querySelector("button")?.click());
  expect(container.textContent).toBe("Riftbound");
  expect(mockNavigate).toHaveBeenCalledWith("/settings/riftbound");
  act(() => root.unmount());
});
