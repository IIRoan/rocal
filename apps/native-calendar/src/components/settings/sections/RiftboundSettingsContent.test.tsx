/** @jest-environment jsdom */
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DEFAULT_RIFTBOUND_PREFERENCES as mockDefaults } from "@workspace/calendar-core/riftbound-settings";
import { RiftboundSettingsContent } from "./RiftboundSettingsContent";

const mockSetDraft = jest.fn();
const mockSave = jest.fn();
const mockSync = jest.fn();
const mockStore = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Fixture shop",
  address: "Venue",
};
const mockDraft = { ...mockDefaults, enabled: true, stores: [mockStore] };

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34 }),
}));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: jest.requireActual("@workspace/design-tokens").nativeLightTheme,
  }),
}));
jest.mock("@workspace/native-core/hooks/use-native-user-settings", () => ({
  useNativeUserSettings: () => ({
    settings: { userId: "fixture", riftbound: mockDefaults },
    saveSetting: jest.fn(),
  }),
}));
jest.mock("../../../hooks/use-calendar-settings", () => ({
  useSettingsCalendars: () => ({ data: [] }),
}));
jest.mock("../../../hooks/use-riftbound", () => ({
  useNativeRiftboundForm: () => ({
    draft: mockDraft,
    setDraft: mockSetDraft,
    eventUrl: "",
    setEventUrl: jest.fn(),
    dirty: false,
    store: { mutate: jest.fn() },
    save: { mutate: mockSave },
    sync: { mutate: mockSync },
  }),
}));
jest.mock("@workspace/native-core/components/settings/SettingsPage", () => ({
  SettingsPage: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
}));
jest.mock("@workspace/native-core/components/layout/HeaderIconButton", () => ({
  HeaderIconButton: ({
    accessibilityLabel,
    onPress,
  }: {
    accessibilityLabel: string;
    onPress: () => void;
  }) => <button aria-label={accessibilityLabel} onClick={onPress} />,
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => {
  const Slot = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    SheetScroll: ({ children }: { children?: ReactNode }) => (
      <div data-scroll>{children}</div>
    ),
    SheetGroup: Slot,
    SheetSection: Slot,
    SheetButton: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button disabled={disabled} onClick={onPress}>
        {label}
      </button>
    ),
    SheetItem: ({
      label,
      trailing,
    }: {
      label: string;
      trailing?: ReactNode;
    }) => (
      <div data-store-row>
        <span>{label}</span>
        {trailing}
      </div>
    ),
    SheetSwitchItem: ({ label }: { label: string }) => <p>{label}</p>,
    SheetTextField: () => <input readOnly />,
    SheetMessage: ({ text }: { text: string }) => <p>{text}</p>,
    SheetCenteredState: Slot,
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(<RiftboundSettingsContent />));
});
afterEach(() => {
  act(() => root.unmount());
});

it("keeps Save and Sync available outside the scrolling drawer content", () => {
  const scroll = container.querySelector("[data-scroll]");
  const save = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Save settings",
  );
  const sync = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Sync now",
  );
  expect(save).toBeDefined();
  expect(sync).toBeDefined();
  expect(scroll?.contains(save ?? null)).toBe(false);
  expect(scroll?.contains(sync ?? null)).toBe(false);
  act(() => {
    save?.click();
    sync?.click();
  });
  expect(mockSave).toHaveBeenCalled();
  expect(mockSync).toHaveBeenCalled();
});

it("removes a store only through its named remove button", () => {
  const row = container.querySelector("[data-store-row]");
  act(() => row?.querySelector("span")?.click());
  expect(mockSetDraft).not.toHaveBeenCalled();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Remove Fixture shop"]')
      ?.click(),
  );
  expect(mockSetDraft).toHaveBeenCalledWith(
    expect.objectContaining({ stores: [] }),
  );
});
