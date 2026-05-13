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

const mockRouterReplace = jest.fn();
const mockStartRouteTransition = jest.fn();
const mockCompleteAuthNavigation = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    unoptimized?: boolean;
  }) => <img {...props} />,
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

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({
    theme: undefined,
  }),
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    error: jest.fn(),
  }),
}));

jest.mock("@workspace/ui/lib/gsap", () => ({
  gsap: {
    fromTo: jest.fn(),
    set: jest.fn(),
    to: jest.fn(),
  },
  useGSAP: jest.fn(),
}));

jest.mock("@workspace/ui/hooks", () => ({
  usePrefersReducedMotion: () => true,
}));

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    Github: Icon,
    Key: Icon,
    Eye: Icon,
    EyeOff: Icon,
    ArrowRight: Icon,
  };
});

jest.mock("@workspace/ui/components/layout", () => ({
  Logo: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>Solace</div>,
  ThemeToggle: () => <button type="button">Theme</button>,
}));

jest.mock("@workspace/ui/components/ui", () => ({
  PageLoadingOverlay: () => <div data-testid="loading-overlay">Loading</div>,
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
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

jest.mock("@workspace/ui/components/ui/label", () => ({
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
}));

jest.mock("@/hooks/use-smooth-router", () => ({
  useSmoothRouter: () => ({
    replace: mockRouterReplace,
    startRouteTransition: mockStartRouteTransition,
  }),
}));

jest.mock("@/lib/api-url", () => ({
  getAppBaseUrl: () => "https://solace.test",
  resolveAuthRedirectTarget: () => ({
    external: false,
    href: "/calendar",
  }),
}));

jest.mock("@/lib/auth-navigation", () => ({
  completeAuthNavigation: (...args: Parameters<typeof mockCompleteAuthNavigation>) =>
    mockCompleteAuthNavigation(...args),
}));

jest.mock("@/lib/calendar-api-service", () => ({
  calendarApiService: {
    updateUserSettings: jest.fn(),
  },
}));

jest.mock("@/lib/account-api-service", () => ({
  accountApiService: {
    getSignupConfig: jest.fn(),
    checkEmailAvailability: jest.fn(),
    getAuthStatus: jest.fn(),
  },
}));

jest.mock("@/lib/mail/account-bootstrap", () => ({
  bootstrapMailboxForAccount: jest.fn(),
}));

jest.mock("@/lib/e2ee-password-cache", () => ({
  clearAuthPasswords: jest.fn(),
  storePendingAuthPassword: jest.fn(),
}));

jest.mock("@/lib/enc-password-cookie", () => ({
  clearEncPasswordCookie: jest.fn(),
  setEncPasswordCookie: jest.fn(),
}));

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: jest.fn(),
    signIn: {
      passkey: jest.fn(),
    },
  },
  signIn: {
    email: jest.fn(),
  },
  signUp: {
    email: jest.fn(),
  },
  useSession: jest.fn(),
}));

import { LoginForm } from "../../app/login/_content";
import { accountApiService } from "@/lib/account-api-service";
import { bootstrapMailboxForAccount } from "@/lib/mail/account-bootstrap";
import { authClient, signIn, signUp, useSession } from "@/lib/auth-client";
import { calendarApiService } from "@/lib/calendar-api-service";
import {
  clearAuthPasswords,
  storePendingAuthPassword,
} from "@/lib/e2ee-password-cache";

const mockUseSession = jest.mocked(useSession);
const mockRequestPasswordReset = jest.mocked(authClient.requestPasswordReset);
const mockPasskeySignIn = jest.mocked(authClient.signIn.passkey);
const mockEmailSignIn = jest.mocked(signIn.email);
const mockEmailSignUp = jest.mocked(signUp.email);
const mockCheckEmailAvailability = jest.mocked(
  accountApiService.checkEmailAvailability,
);
const mockGetSignupConfig = jest.mocked(accountApiService.getSignupConfig);
const mockGetAuthStatus = jest.mocked(accountApiService.getAuthStatus);
const mockBootstrapMailboxForAccount = jest.mocked(bootstrapMailboxForAccount);
const mockUpdateUserSettings = jest.mocked(calendarApiService.updateUserSettings);
const mockStorePendingAuthPassword = jest.mocked(storePendingAuthPassword);
const mockClearAuthPasswords = jest.mocked(clearAuthPasswords);

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );

  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSearchParams = new URLSearchParams();
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    });
    mockGetSignupConfig.mockResolvedValue({
      defaultEmailDomain: "solace.onl",
    });
    mockCheckEmailAvailability.mockResolvedValue({
      email: "roan",
      localPart: "roan",
      domain: "solace.onl",
      normalizedEmail: "roan@solace.onl",
      available: true,
      code: "available",
      message: "That email address is available.",
    });
    mockBootstrapMailboxForAccount.mockResolvedValue({
      email: "roan@solace.onl",
      displayName: "Roan",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234EF567890",
      encryptionAtRestEnabled: true,
    });
    mockEmailSignIn.mockResolvedValue({});
    mockEmailSignUp.mockResolvedValue({});
    mockPasskeySignIn.mockResolvedValue({ user: { id: "user-1" } });
    mockRequestPasswordReset.mockResolvedValue({});
    mockGetAuthStatus.mockResolvedValue({
      authenticated: true,
      hasPasskeys: false,
      requiresPasskeyStepUp: false,
    });
    (
      globalThis as typeof globalThis & {
        PublicKeyCredential?: typeof PublicKeyCredential;
      }
    ).PublicKeyCredential = function PublicKeyCredential() {} as any;
    (
      window as typeof window & {
        PublicKeyCredential?: typeof PublicKeyCredential;
      }
    ).PublicKeyCredential = function PublicKeyCredential() {} as any;
    mockCompleteAuthNavigation.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  async function renderForm() {
    await act(async () => {
      root.render(<LoginForm />);
      await Promise.resolve();
    });
  }

  it("shows the clarified sign-up subtitle when switching to sign-up mode", async () => {
    await renderForm();

    const signUpButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Sign up",
    );

    await act(async () => {
      signUpButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Create an account");
    expect(container.textContent).toContain(
      "Choose your @solace.onl Solace email and password.",
    );
    expect(container.textContent).toContain("Full name");
    expect(container.textContent).toContain("Solace email");
  });

  it("shows the clarified forgot-password title and subtitle", async () => {
    await renderForm();

    const forgotPasswordButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent === "Forgot password?");

    await act(async () => {
      forgotPasswordButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Reset your email sign-in password",
    );
    expect(container.textContent).toContain(
      "Enter your Solace account email and we’ll send a reset link for your email sign-in password.",
    );
  });

  it("shows the clarified password reset success notice", async () => {
    await renderForm();

    const forgotPasswordButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent === "Forgot password?");

    await act(async () => {
      forgotPasswordButton?.click();
      await Promise.resolve();
    });

    const emailInput = container.querySelector("#email") as HTMLInputElement | null;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Send reset link"),
    );

    await act(async () => {
      setInputValue(emailInput as HTMLInputElement, "roan@solace.onl");
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockRequestPasswordReset).toHaveBeenCalledWith({
      email: "roan@solace.onl",
      redirectTo: "https://solace.test/reset-password",
    });
    expect(container.textContent).toContain(
      "If an account exists for that email, we sent a password reset link for your email sign-in password.",
    );
  });

  it("shows the clarified reset-success banner from the query string", async () => {
    mockSearchParams = new URLSearchParams("reset=success");

    await renderForm();

    expect(container.textContent).toContain(
      "Your email sign-in password has been updated. The next time you sign in with email, Solace will also use it to protect your encryption keys.",
    );
  });

  it("stores the pending auth password after a successful email sign-in", async () => {
    await renderForm();

    const emailInput = container.querySelector("#email") as HTMLInputElement | null;
    const passwordInput = container.querySelector(
      "#password",
    ) as HTMLInputElement | null;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Sign in"),
    );

    await act(async () => {
      setInputValue(emailInput as HTMLInputElement, "roan@solace.onl");
      setInputValue(passwordInput as HTMLInputElement, "secret-password");
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockEmailSignIn).toHaveBeenCalledWith({
      email: "roan@solace.onl",
      password: "secret-password",
    });
    expect(mockStorePendingAuthPassword).toHaveBeenCalledWith("secret-password");
  });

  it("checks email availability before signing up with email", async () => {
    await renderForm();

    const signUpButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "Sign up",
    );

    await act(async () => {
      signUpButton?.click();
      await Promise.resolve();
    });

    const nameInput = container.querySelector("#name") as HTMLInputElement | null;
    const desiredEmailInput = container.querySelector(
      "#desired-email",
    ) as HTMLInputElement | null;
    const passwordInput = container.querySelector(
      "#password",
    ) as HTMLInputElement | null;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Create account"),
    );

    await act(async () => {
      setInputValue(nameInput as HTMLInputElement, "Roan");
      setInputValue(desiredEmailInput as HTMLInputElement, "RoAn");
      setInputValue(passwordInput as HTMLInputElement, "secret-password");
      submitButton?.click();
      await Promise.resolve();
    });

    expect(mockCheckEmailAvailability).toHaveBeenCalledWith("roan");
    expect(mockEmailSignUp).toHaveBeenCalledWith({
      email: "roan@solace.onl",
      password: "secret-password",
      name: "Roan",
    });
    expect(mockStorePendingAuthPassword).toHaveBeenCalledWith("secret-password");
    expect(mockBootstrapMailboxForAccount).toHaveBeenCalledWith({
      email: "roan@solace.onl",
      password: "secret-password",
      displayName: "Roan",
    });
    expect(mockStorePendingAuthPassword.mock.invocationCallOrder[0]).toBeLessThan(
      mockBootstrapMailboxForAccount.mock.invocationCallOrder[0],
    );
  });

  it("auto-prompts passkey step-up after password sign-in without clearing cached auth passwords", async () => {
    mockGetAuthStatus
      .mockResolvedValueOnce({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: true,
      })
      .mockResolvedValue({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: false,
      });

    await renderForm();

    const emailInput = container.querySelector("#email") as HTMLInputElement | null;
    const passwordInput = container.querySelector(
      "#password",
    ) as HTMLInputElement | null;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Sign in"),
    );

    await act(async () => {
      setInputValue(emailInput as HTMLInputElement, "roan@solace.onl");
      setInputValue(passwordInput as HTMLInputElement, "secret-password");
      submitButton?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockClearAuthPasswords).not.toHaveBeenCalled();
    expect(mockPasskeySignIn).toHaveBeenCalledWith({
      autoFocus: true,
    });
  });

  it("redirects after a successful auto-prompted passkey step-up even when the passkey response omits the user payload", async () => {
    mockGetAuthStatus
      .mockResolvedValueOnce({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: true,
      })
      .mockResolvedValue({
        authenticated: true,
        hasPasskeys: true,
        requiresPasskeyStepUp: false,
    });
    mockPasskeySignIn.mockResolvedValue({});

    await renderForm();

    const emailInput = container.querySelector("#email") as HTMLInputElement | null;
    const passwordInput = container.querySelector(
      "#password",
    ) as HTMLInputElement | null;
    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Sign in"),
    );

    await act(async () => {
      setInputValue(emailInput as HTMLInputElement, "roan@solace.onl");
      setInputValue(passwordInput as HTMLInputElement, "secret-password");
      submitButton?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPasskeySignIn).toHaveBeenCalledWith({
      autoFocus: true,
    });
    expect(mockCompleteAuthNavigation).toHaveBeenCalledWith("/calendar");
  });
});
