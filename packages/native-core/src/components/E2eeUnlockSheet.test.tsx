/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { E2eeUnlockSheet } from "./E2eeUnlockSheet";

const mockUnlockWithPassword = jest.fn<Promise<boolean>, [string]>();
const mockSignOut = jest.fn(() => Promise.resolve());

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles },
  Text: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

jest.mock("../providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: jest.requireActual("@workspace/design-tokens").nativeLightTheme,
  }),
}));

jest.mock("../providers/E2eeProvider", () => ({
  useE2ee: () => ({
    needsPassword: true,
    unlockWithPassword: mockUnlockWithPassword,
  }),
}));

jest.mock("../providers/AuthProvider", () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

jest.mock("./BottomSheet", () => {
  const Slot = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BottomSheet: ({ children, visible }: { children?: ReactNode; visible: boolean }) =>
      visible ? <section aria-label="drawer">{children}</section> : null,
    BottomSheetBody: Slot,
    BottomSheetFooter: Slot,
    BottomSheetHeader: Slot,
    BottomSheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  };
});

jest.mock("./sheet/SheetActions", () => {
  const Button = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button aria-label={label} onClick={onPress} />
  );
  return {
    SheetActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    SheetPrimaryButton: Button,
    SheetSecondaryButton: Button,
  };
});

jest.mock("./sheet/SheetSections", () => ({
  SheetMessage: ({ text }: { text: string }) => <p role="alert">{text}</p>,
  SheetTextField: ({
    value,
    onChangeText,
    onSubmitEditing,
    accessibilityLabel,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    onSubmitEditing: () => void;
    accessibilityLabel: string;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      onChange={(event) => onChangeText(event.target.value)}
      onKeyDown={(event) => event.key === "Enter" && onSubmitEditing()}
    />
  ),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;
const onUnlocked = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
  act(() => root.render(<E2eeUnlockSheet onUnlocked={onUnlocked} />));
});

afterEach(() => {
  act(() => root.unmount());
});

const passwordInput = () =>
  container.querySelector<HTMLInputElement>('input[aria-label="Password"]');

async function type(password: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(passwordInput(), password);
    passwordInput()?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(password: string) {
  await type(password);
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[aria-label="Unlock"]')?.click();
  });
}

async function pressReturn() {
  await act(async () => {
    passwordInput()?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

it("keeps the drawer open with an explanation when the password is wrong", async () => {
  mockUnlockWithPassword.mockResolvedValue(false);

  await submit("wrong");

  expect(mockUnlockWithPassword).toHaveBeenCalledWith("wrong");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("did not unlock");
  expect(onUnlocked).not.toHaveBeenCalled();
});

it("restarts startup once the password unlocks the account key", async () => {
  mockUnlockWithPassword.mockResolvedValue(true);

  await submit("previous-password");

  expect(onUnlocked).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("tells a network failure apart from a wrong password", async () => {
  mockUnlockWithPassword.mockRejectedValue(new Error("Network request failed"));

  await submit("previous-password");

  expect(container.querySelector('[role="alert"]')?.textContent).toContain("connection");
  expect(onUnlocked).not.toHaveBeenCalled();
});

it("offers signing out instead of unlocking", async () => {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('button[aria-label="Sign out"]')?.click();
  });

  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockUnlockWithPassword).not.toHaveBeenCalled();
});

it("ignores the return key without a password or while an unlock runs", async () => {
  mockUnlockWithPassword.mockReturnValue(new Promise<boolean>(() => undefined));

  await pressReturn();
  expect(mockUnlockWithPassword).not.toHaveBeenCalled();

  await type("previous-password");
  await pressReturn();
  await pressReturn();
  expect(mockUnlockWithPassword).toHaveBeenCalledTimes(1);
});
