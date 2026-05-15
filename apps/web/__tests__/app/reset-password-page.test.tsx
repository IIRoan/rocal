/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";

const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    error: jest.fn(),
  }),
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    ArrowRight: Icon,
  };
});

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    resetPassword: jest.fn(),
  },
}));

jest.mock("@workspace/ui/components/layout", () => ({
  Logo: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>Solace</div>
  ),
  ThemeToggle: () => <button type="button">Theme</button>,
}));

jest.mock("@workspace/ui/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@workspace/ui/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

jest.mock("@workspace/ui/components/ui/label", () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

import ResetPasswordPage from "../../app/reset-password/page";
import { authClient } from "@/lib/auth-client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const mockResetPassword = jest.mocked(authClient.resetPassword);

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSearchParams = new URLSearchParams("token=token-123");
    mockResetPassword.mockResolvedValue({});
    mockReplace.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it("explains the email sign-in password versus encryption password distinction", async () => {
    await act(async () => {
      root.render(<ResetPasswordPage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Choose a new email sign-in password",
    );
    expect(container.textContent).toContain(
      "Reset the password you use to sign in to Solace with email.",
    );
    expect(container.textContent).toContain(
      "If you sign in with email and password, Solace also uses this password to protect your encryption keys after you sign in.",
    );
  });

  it("submits a valid reset and redirects to the login success state", async () => {
    await act(async () => {
      root.render(<ResetPasswordPage />);
      await Promise.resolve();
    });

    const newPasswordInput = container.querySelector(
      "#newPassword",
    ) as HTMLInputElement | null;
    const confirmPasswordInput = container.querySelector(
      "#confirmPassword",
    ) as HTMLInputElement | null;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Update password"),
    );

    expect(newPasswordInput).not.toBeNull();
    expect(confirmPasswordInput).not.toBeNull();
    expect(submitButton).toBeDefined();

    await act(async () => {
      setInputValue(newPasswordInput as HTMLInputElement, "new-password");
      setInputValue(confirmPasswordInput as HTMLInputElement, "new-password");
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockResetPassword).toHaveBeenCalledWith({
      token: "token-123",
      newPassword: "new-password",
    });
    expect(mockReplace).toHaveBeenCalledWith("/login?reset=success");
  });

  it("shows the invalid token state instead of the form", async () => {
    mockSearchParams = new URLSearchParams("error=INVALID_TOKEN");

    await act(async () => {
      root.render(<ResetPasswordPage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "This reset link is invalid or has expired. Request a new password reset email.",
    );
    expect(container.querySelector("#newPassword")).toBeNull();
    expect(container.querySelector("#confirmPassword")).toBeNull();
  });
});
