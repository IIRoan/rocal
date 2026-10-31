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
let mockDirty = false;
let mockDraft = { ...mockDefaults, enabled: true, stores: [mockStore] };

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pressable: ({
    accessibilityLabel,
    onPress,
    children,
  }: {
    accessibilityLabel: string;
    onPress: () => void;
    children?: ReactNode;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  useMailSkin: () => ({ selected: "transparent" }),
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
    dirty: mockDirty,
    store: { mutate: jest.fn() },
    save: { mutate: mockSave },
    sync: { mutate: mockSync },
    status: null,
  }),
}));
jest.mock("@workspace/native-core/components/settings/SettingsPage", () => ({
  SettingsPage: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
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
    SheetSection: ({
      title,
      children,
    }: {
      title?: string;
      children?: ReactNode;
    }) => (
      <div>
        {title ? <h3>{title}</h3> : null}
        {children}
      </div>
    ),
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
      onPress,
    }: {
      label: string;
      trailing?: ReactNode;
      onPress?: () => void;
    }) => (
      <div data-row={label}>
        <span onClick={onPress}>{label}</span>
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
function render() {
  act(() => root.render(<RiftboundSettingsContent />));
}
function button(label: string) {
  return [...container.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  mockDirty = false;
  mockDraft = { ...mockDefaults, enabled: true, stores: [mockStore] };
  container = document.createElement("div");
  root = createRoot(container);
  render();
});
afterEach(() => {
  act(() => root.unmount());
});

it("keeps Save and Sync outside the scrolling drawer, saving only changes", () => {
  const scroll = container.querySelector("[data-scroll]");
  expect(scroll?.contains(button("Save") ?? null)).toBe(false);
  expect(scroll?.contains(button("Sync now") ?? null)).toBe(false);
  expect(button("Save")?.disabled).toBe(true);
  act(() => button("Sync now")?.click());
  expect(mockSync).toHaveBeenCalled();
  mockDirty = true;
  render();
  act(() => button("Save")?.click());
  expect(mockSave).toHaveBeenCalled();
});

it("removes a store only through its named remove button", () => {
  const row = container.querySelector('[data-row="Fixture shop"]');
  act(() => row?.querySelector("span")?.click());
  expect(mockSetDraft).not.toHaveBeenCalled();
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Remove Fixture shop"]')
      ?.click(),
  );
  const update = mockSetDraft.mock.calls[0]?.[0] as (
    draft: typeof mockDraft,
  ) => typeof mockDraft;
  expect(update(mockDraft).stores).toEqual([]);
});

it("asks for the Riot ID only for registered-only matching", () => {
  expect(container.textContent).not.toContain("Riot ID");
  mockDraft = { ...mockDraft, registeredOnly: true };
  render();
  expect(container.textContent).toContain("Riot ID");
});

it("offers preset event lengths instead of a free-form number", () => {
  act(() =>
    container
      .querySelector('[data-row="6 hours"]')
      ?.querySelector("span")
      ?.click(),
  );
  expect(mockSetDraft).toHaveBeenCalledWith(
    expect.objectContaining({ durationMinutes: 360 }),
  );
});
