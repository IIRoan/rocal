/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RECOVERY_KIT_NOTICE } from "@workspace/calendar-core/product-info";
import { RecoveryKitPage } from "./RecoveryKitPage";

const mockMutate = jest.fn();
const mockReset = jest.fn();
const mockCopy = jest.fn(async (_value: string) => true);
const mockShare = jest.fn(async (_content: { message: string }) => ({}));
let mockKitState: { data?: string; exists: boolean };

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
  Share: { share: (content: { message: string }) => mockShare(content) },
  StyleSheet: { create: (styles: object) => styles },
  Text: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
jest.mock("expo-clipboard", () => ({
  setStringAsync: (value: string) => mockCopy(value),
}));
jest.mock("../../../providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: {
      spacing: { "2": 8, "3": 12 },
      colors: { foreground: "fg" },
      typography: { fontFamily: { mono: "mono" }, fontSize: { base: { size: 16, lineHeight: 24 } } },
    },
  }),
}));
jest.mock("../../../providers/ToastProvider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
jest.mock("../../../hooks/use-recovery-kit", () => ({
  useRecoveryKit: () => ({
    statusQuery: { data: { exists: mockKitState.exists } },
    createMutation: {
      data: mockKitState.data,
      error: null,
      isPending: false,
      mutate: mockMutate,
      reset: mockReset,
    },
    deleteMutation: { isPending: false, mutate: jest.fn() },
  }),
}));
jest.mock("../../sheet/SheetSections", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    SheetGroup: Pass,
    SheetSection: ({ footer, children }: { footer?: string; children?: ReactNode }) => (
      <section>
        {children}
        <footer>{footer}</footer>
      </section>
    ),
    SheetMessage: ({ text }: { text: string }) => <p role="alert">{text}</p>,
    SheetButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button type="button" aria-label={label} onClick={onPress} />
    ),
    SheetTextField: ({
      accessibilityLabel,
      value,
      onChangeText,
    }: {
      accessibilityLabel: string;
      value: string;
      onChangeText: (value: string) => void;
    }) => (
      <input
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;

function click(label: string) {
  act(() => {
    container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("creates a kit with the current password", () => {
  mockKitState = { exists: false };
  act(() => root.render(<RecoveryKitPage onClose={jest.fn()} />));
  const input = container.querySelector<HTMLInputElement>('[aria-label="Current password"]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, "current-pw");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });

  click("Create kit");

  expect(mockMutate).toHaveBeenCalledWith("current-pw", expect.anything());
});

it("shows the new key once, copies or shares it, and forgets it when saved", async () => {
  mockKitState = { exists: true, data: "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789" };
  const onClose = jest.fn();
  act(() => root.render(<RecoveryKitPage onClose={onClose} />));

  expect(container.textContent).toContain(mockKitState.data);
  expect(container.textContent).toContain(RECOVERY_KIT_NOTICE);
  click("Copy");
  click("Share");
  expect(mockCopy).toHaveBeenCalledWith(mockKitState.data);
  expect(mockShare).toHaveBeenCalledWith({
    message: `Solace recovery key: ${mockKitState.data}`,
  });

  click("I saved it");

  expect(mockReset).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
