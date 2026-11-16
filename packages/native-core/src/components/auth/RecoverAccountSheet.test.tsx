/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { pbkdf2Sync, webcrypto } from "node:crypto";
import { createE2eeModule, type CryptoProvider } from "@workspace/e2ee";
import { RECOVERY_KEY_TYPO_MESSAGE } from "@workspace/calendar-client";
import { RecoverAccountSheet } from "./RecoverAccountSheet";

// Node's WebCrypto matches the provider at runtime; only the DOM-shaped declarations differ.
const mockCrypto = webcrypto as unknown as CryptoProvider;
const mockArgon2id = async (password: Uint8Array, salt: Uint8Array) =>
  new Uint8Array(pbkdf2Sync(password, salt, 1, 32, "sha256"));
const mockFetch = jest.fn();
const mockSignIn = jest.fn();
const mockAlert = jest.fn();

jest.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  StyleSheet: { create: (styles: object) => styles },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
jest.mock("../../lib/native-crypto-provider", () => ({
  createNativeCryptoProvider: () => mockCrypto,
  nativeArgon2id: (password: Uint8Array, salt: Uint8Array) => mockArgon2id(password, salt),
}));
jest.mock("../../lib/auth-client", () => ({
  authClient: { $fetch: (path: string, options: unknown) => mockFetch(path, options) },
}));
jest.mock("../../providers/AuthProvider", () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));
jest.mock("../../providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: { spacing: { "2": 8, "3": 12, "4": 16 } } }),
}));
jest.mock("../BottomSheet", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    BottomSheet: Pass,
    BottomSheetFooter: Pass,
    BottomSheetHeader: Pass,
    BottomSheetScrollView: Pass,
    BottomSheetTitle: Pass,
  };
});
jest.mock("../sheet/SheetSections", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    SheetGroup: Pass,
    SheetSection: Pass,
    SheetMessage: ({ text }: { text: string }) => <p role="alert">{text}</p>,
    SheetButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button type="button" aria-label={label} onClick={onPress} />
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
      <input
        type="checkbox"
        aria-label={label}
        checked={value}
        onChange={(event) => onValueChange(event.target.checked)}
      />
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

const e2ee = createE2eeModule(mockCrypto, { argon2id: mockArgon2id });
let root: Root;
let container: HTMLDivElement;

function field(label: string) {
  const input = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!input) throw new Error(`Missing ${label}`);
  return input;
}

function type(label: string, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(field(label), value);
    field(label).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[aria-label="Reset password"]')?.click();
  });
}

/** The recovery runs real crypto, which takes a few ticks. */
async function waitFor(done: () => boolean) {
  for (let attempt = 0; attempt < 200 && !done(); attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function render(onDismiss = jest.fn(), lostPasskey = false) {
  act(() => {
    root.render(
      <RecoverAccountSheet visible initialEmail="ada@solace.test" lostPasskey={lostPasskey} onDismiss={onDismiss} />,
    );
  });
  return onDismiss;
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

it("prefills the email and keeps passkeys unless turned on", () => {
  render();

  expect(field("Email address").value).toBe("ada@solace.test");
  expect(field("Remove passkeys (I lost them)").checked).toBe(false);
});

it("removes passkeys by default when opened from the lost-passkey link", () => {
  render(jest.fn(), true);

  expect(field("Remove passkeys (I lost them)").checked).toBe(true);
});

it("refuses a mistyped key before anything reaches the network", async () => {
  render();
  const { recoveryKey } = await e2ee.generateRecoveryKey();
  type("Recovery key", `${recoveryKey.charAt(0) === "A" ? "B" : "A"}${recoveryKey.slice(1)}`);
  type("New password", "new-secret-pw");
  type("Confirm new password", "new-secret-pw");

  await submit();
  await waitFor(() => container.textContent?.includes(RECOVERY_KEY_TYPO_MESSAGE) ?? false);

  expect(mockFetch).not.toHaveBeenCalled();
  expect(container.textContent).toContain(RECOVERY_KEY_TYPO_MESSAGE);
});

it("resets the password with the kit, then signs in with the new one", async () => {
  const keys = {
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
  };
  const { secret, recoveryKey } = await e2ee.generateRecoveryKey();
  const envelope = await e2ee.createRecoveryEnvelope(keys.accountKey, keys.blindIndexKey, secret);
  mockFetch.mockImplementation(async (path: string) => ({
    data: path === "/recovery/start" ? envelope : { status: true },
    error: null,
  }));
  mockSignIn.mockResolvedValue({ requiresPasskeyStepUp: false });
  const onDismiss = render();
  type("Recovery key", recoveryKey.toLowerCase());
  type("New password", "new-secret-pw");
  type("Confirm new password", "new-secret-pw");

  await submit();
  await waitFor(() => mockAlert.mock.calls.length > 0);

  expect(mockFetch).toHaveBeenLastCalledWith(
    "/recovery/complete",
    expect.objectContaining({
      body: expect.objectContaining({
        email: "ada@solace.test",
        newPassword: "new-secret-pw",
        removePasskeys: false,
      }),
    }),
  );
  expect(mockSignIn).toHaveBeenCalledWith("ada@solace.test", "new-secret-pw");
  expect(onDismiss).toHaveBeenCalled();
  expect(mockAlert).toHaveBeenCalledWith("Password reset", expect.stringContaining("recovery kit"));
});

it("asks for matching passwords without calling the API", async () => {
  render();
  type("Recovery key", "AAAA");
  type("New password", "new-secret-pw");
  type("Confirm new password", "other-pw");

  await submit();

  expect(mockFetch).not.toHaveBeenCalled();
  expect(container.textContent).toContain("must match");
});
