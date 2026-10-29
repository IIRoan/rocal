/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppErrorBoundary } from "./AppErrorBoundary";

const mockUpdates = {
  isEnabled: true,
  reloadAsync: jest.fn(() => Promise.resolve()),
};

jest.mock("expo-updates", () => ({
  get isEnabled() {
    return mockUpdates.isEnabled;
  },
  reloadAsync: () => mockUpdates.reloadAsync(),
}));

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

jest.mock("./BottomSheet", () => {
  const Slot = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BottomSheet: ({ children, onDismiss }: { children?: ReactNode; onDismiss: () => void }) => (
      <section aria-label="drawer">
        {children}
        <button aria-label="Swipe away" onClick={onDismiss} />
      </section>
    ),
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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let broken = true;

function Screen() {
  if (broken) throw new Error("render failed");
  return <main aria-label="Calendar" />;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  broken = true;
  mockUpdates.isEnabled = true;
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  jest.restoreAllMocks();
});

function render() {
  act(() =>
    root.render(
      <AppErrorBoundary>
        <Screen />
      </AppErrorBoundary>,
    ),
  );
}

function press(label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`No "${label}" button`);
  act(() => button.click());
}

it("renders the app while nothing throws", () => {
  broken = false;
  render();
  expect(container.querySelector("main")).not.toBeNull();
  expect(container.querySelector("section")).toBeNull();
});

it("swaps a crashed screen for the recovery drawer", () => {
  render();
  expect(container.querySelector("h2")?.textContent).toBe("Something went wrong");
});

it("renders the app again on Try again, or when the drawer is swiped away", () => {
  render();
  broken = false;
  press("Try again");
  expect(container.querySelector("main")).not.toBeNull();

  broken = true;
  render();
  broken = false;
  press("Swipe away");
  expect(container.querySelector("main")).not.toBeNull();
});

it("shows the drawer again when the screen keeps failing", () => {
  render();
  press("Try again");
  expect(container.querySelector("h2")?.textContent).toBe("Something went wrong");
});

it("restarts the app, offering it only where OTA reloads work", () => {
  render();
  press("Restart");
  expect(mockUpdates.reloadAsync).toHaveBeenCalled();

  mockUpdates.isEnabled = false;
  act(() => root.unmount());
  root = createRoot(container);
  render();
  expect(container.querySelector('button[aria-label="Restart"]')).toBeNull();
});
