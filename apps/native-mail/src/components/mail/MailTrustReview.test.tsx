/** @jest-environment jsdom */
import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, jest } from "@jest/globals";
import { MailTrustReviewDrawer } from "./MailTrustReview";
import type { MailTrustProblem } from "@workspace/calendar-core";

jest.mock("react-native", () => ({
  StyleSheet: { create: (value: object) => value },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
jest.mock("@workspace/native-core/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "synthetic-user" } }),
}));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: jest.requireActual<typeof import("@workspace/design-tokens")>(
      "@workspace/design-tokens",
    ).nativeLightTheme,
  }),
}));
jest.mock("../../lib/mail/mail-trust", () => ({ mailTrustReviewBridge: {} }));
jest.mock("@workspace/native-core/components/BottomSheet", () => ({
  BottomSheet: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  BottomSheetHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  BottomSheetTitle: ({ children }: { children: ReactNode }) => (
    <h1>{children}</h1>
  ),
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => ({
  SheetScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetSection: ({
    title,
    children,
  }: {
    title?: string;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  SheetMessage: ({ text }: { text: string }) => <p>{text}</p>,
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
  SheetSwitchItem: ({
    label,
    value,
    onValueChange,
  }: {
    label: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onValueChange(!value)}
    >
      {label}
    </button>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const settle = jest.fn();
beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  settle.mockClear();
});
afterEach(() => act(() => root.unmount()));
function render(problem: MailTrustProblem) {
  act(() =>
    root.render(<MailTrustReviewDrawer problem={problem} settle={settle} />),
  );
}
function button(text: string) {
  const value = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((item) => item.textContent === text);
  if (!value) throw new Error(`Missing ${text} button`);
  return value;
}
it("shows both native fingerprints and commits only an explicit approval action", () => {
  render({
    kind: "changed",
    email: "synthetic@solace.test",
    oldFingerprint: "A".repeat(40),
    newFingerprint: "B".repeat(40),
  });
  expect(container.textContent).toContain("A".repeat(40));
  expect(container.textContent).toContain("B".repeat(40));
  expect(settle).not.toHaveBeenCalled();
  act(() => button("Approve replacement").click());
  expect(settle).toHaveBeenCalledWith("approve");
});
it("requires a warning acknowledgment before native reset", () => {
  render({ kind: "missing", expectedEncryptedTrust: null, resetAllowed: true });
  act(() => button("Reset key history…").click());
  expect(button("Reset saved key history").disabled).toBe(true);
  expect(container.textContent).toContain("every saved correspondent key");
  act(() => button("Reset saved key history").click());
  expect(settle).not.toHaveBeenCalled();
  const acknowledgment =
    container.querySelector<HTMLButtonElement>('[role="switch"]');
  if (!acknowledgment) throw new Error("Acknowledgment missing");
  act(() => acknowledgment.click());
  act(() => button("Reset saved key history").click());
  expect(settle).toHaveBeenCalledWith("reset");
});
it("keeps newer native history intact and exposes no reset escape", () => {
  render({
    kind: "update_required",
    expectedEncryptedTrust: "SYNTHETIC-new-version",
  });
  expect(container.textContent).toContain("Update Solace");
  expect(container.textContent).not.toContain("Reset key history");
  expect(container.textContent).not.toContain("Approve replacement");
  act(() => button("Cancel").click());
  expect(settle).toHaveBeenCalledWith("cancel");
});
it("makes full-capacity failure and retry visible on native", () => {
  render({
    kind: "capacity",
    expectedEncryptedTrust: "SYNTHETIC-full-history",
    resetAllowed: true,
  });
  expect(container.textContent).toContain("history is full");
  act(() => button("Retry").click());
  expect(settle).toHaveBeenCalledWith("retry");
});

it("confirms one selected removal without forgetting the other saved keys", () => {
  render({
    kind: "capacity",
    expectedEncryptedTrust: "SYNTHETIC-full",
    removablePins: [
      { email: "alice@solace.test", fingerprint: "A".repeat(40) },
      { email: "bob@solace.test", fingerprint: "B".repeat(40) },
    ],
  });
  act(() => button("Select bob@solace.test").click());
  expect(settle).not.toHaveBeenCalled();
  expect(container.textContent).toContain("for bob@solace.test");
  act(() => button("Remove selected saved key").click());
  expect(settle).toHaveBeenCalledWith({
    kind: "remove",
    email: "bob@solace.test",
    fingerprint: "B".repeat(40),
  });
});

it("requires acknowledged deliberate reset for valid older history rather than clearing it automatically", () => {
  render({
    kind: "rollback",
    expectedEncryptedTrust: "mt1.SYNTHETIC-older-valid-history",
    resetAllowed: true,
  });
  expect(container.textContent).toContain("older than this device last saw");
  expect(settle).not.toHaveBeenCalled();
  act(() => button("Reset key history…").click());
  expect(button("Reset saved key history").disabled).toBe(true);
  act(() =>
    button(
      "I understand all saved correspondent keys will be forgotten",
    ).click(),
  );
  act(() => button("Reset saved key history").click());
  expect(settle).toHaveBeenCalledWith("reset");
});
