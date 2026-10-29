/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AccountPasswordForm } from "./AccountSettingsContent";

const envelope = { kdfSalt: "new-salt", wrappedAccountKey: "wrapped" };
const mockCreatePasswordEnvelope = jest.fn();
const mockChangePassword = jest.fn();
const mockRememberDeviceEnvelopeSalt = jest.fn(async (_salt: string) => undefined);
const mockToast = jest.fn();

jest.mock("react-native", () => ({ Alert: { alert: jest.fn() } }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
jest.mock("../SettingsPage", () => ({}));
jest.mock("../../BlobatarAvatar", () => ({}));
jest.mock("../../sheet/SheetSections", () => ({}));
jest.mock("../../../lib/settings-screen-utils", () => ({}));
jest.mock("../../../hooks/use-native-user-settings", () => ({}));
jest.mock("../../../lib/api", () => ({}));
jest.mock("../../../lib/profile-picture", () => ({}));
jest.mock("../../../lib/auth-client", () => ({
  authClient: {
    changePassword: (input: unknown) => mockChangePassword(input),
  },
}));
jest.mock("../../../lib/native-e2ee-provider", () => ({
  rememberDeviceEnvelopeSalt: (salt: string) =>
    mockRememberDeviceEnvelopeSalt(salt),
}));
jest.mock("../../../providers/AuthProvider", () => ({
  useAuth: () => ({ user: { email: "ada@solace.test" } }),
}));
jest.mock("../../../providers/E2eeProvider", () => ({
  useE2ee: () => ({ createPasswordEnvelope: mockCreatePasswordEnvelope }),
}));
jest.mock("../../../providers/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock("../../../hooks/use-linked-auth-accounts", () => ({
  useLinkedAuthAccounts: () => ({ refetch: jest.fn() }),
}));
jest.mock("../SettingsAccountForms", () => ({
  SettingsPasswordForm: ({
    onCurrentPasswordChange,
    onNewPasswordChange,
    onConfirmPasswordChange,
    onSubmit,
    error,
  }: {
    onCurrentPasswordChange: (value: string) => void;
    onNewPasswordChange: (value: string) => void;
    onConfirmPasswordChange: (value: string) => void;
    onSubmit: () => void;
    error: string | null;
  }): ReactNode => (
    <form>
      <input aria-label="current" onChange={(e) => onCurrentPasswordChange(e.target.value)} />
      <input aria-label="new" onChange={(e) => onNewPasswordChange(e.target.value)} />
      <input aria-label="confirm" onChange={(e) => onConfirmPasswordChange(e.target.value)} />
      <button type="button" onClick={onSubmit}>
        Submit
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  ),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let container: HTMLDivElement;

function type(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!input) throw new Error(`Missing ${label} field`);
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitChange(onClose: () => void) {
  act(() => {
    root.render(<AccountPasswordForm mode="change-password" onClose={onClose} />);
  });
  type("current", "old-password");
  type("new", "new-password");
  type("confirm", "new-password");
  await act(async () => {
    container.querySelector("button")?.click();
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

it("sends the envelope for the new password with the change so the server stores both", async () => {
  mockCreatePasswordEnvelope.mockResolvedValue(envelope);
  mockChangePassword.mockResolvedValue({ data: {}, error: null });
  const onClose = jest.fn();

  await submitChange(onClose);

  expect(mockCreatePasswordEnvelope).toHaveBeenCalledWith("new-password");
  expect(mockChangePassword).toHaveBeenCalledWith({
    currentPassword: "old-password",
    newPassword: "new-password",
    email: "ada@solace.test",
    passwordEnvelope: envelope,
  });
  expect(mockRememberDeviceEnvelopeSalt).toHaveBeenCalledWith("new-salt");
  expect(onClose).toHaveBeenCalled();
});

it("does not change the password when this device cannot wrap the keys", async () => {
  mockCreatePasswordEnvelope.mockRejectedValue(
    new Error("Your encrypted data is not unlocked on this device."),
  );
  const onClose = jest.fn();

  await submitChange(onClose);

  expect(mockChangePassword).not.toHaveBeenCalled();
  expect(mockRememberDeviceEnvelopeSalt).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Your encrypted data is not unlocked on this device.",
  );
});
