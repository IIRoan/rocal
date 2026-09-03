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

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    RotateCcw: Icon,
    Check: Icon,
    X: Icon,
    ArrowLeft: Icon,
    AlertTriangle: Icon,
    Trash2: Icon,
    Lock: Icon,
    Loader2: Icon,
    ImageIcon: Icon,
    Pencil: Icon,
  };
});

jest.mock("@workspace/ui/components/ui/blobatar-avatar", () => ({
  BlobatarAvatar: ({ email }: { email?: string }) => (
    <div data-testid="blobatar-avatar">{email}</div>
  ),
}));

import { AccountSettings } from "../../components/command-palette/account-settings";

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

describe("AccountSettings", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders account info and delete-account confirmation flow", async () => {
    const handleDeleteAccount = jest.fn();
    const handleChangePassword = jest.fn<() => Promise<void>>(
      async () => undefined,
    );

    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={handleDeleteAccount}
          accountName="Roan"
          accountEmail="roan@example.com"
          accountImage={null}
          sessionLoading={false}
          changingPassword={false}
          handleChangePassword={handleChangePassword}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Roan");
    expect(container.textContent).toContain("roan@example.com");
    expect(container.textContent).toContain("Change Password");

    const openDeleteButton = Array.from(
      container.querySelectorAll("button"),
    ).find((el) => el.textContent?.includes("Delete Account"));
    expect(openDeleteButton).toBeDefined();

    await act(async () => {
      openDeleteButton?.click();
      await Promise.resolve();
    });

    const confirmDeleteButton = Array.from(
      container.querySelectorAll("button"),
    ).find((el) => el.textContent?.includes("Delete my account"));
    expect(confirmDeleteButton).toBeDefined();

    await act(async () => {
      confirmDeleteButton?.click();
      await Promise.resolve();
    });

    expect(handleDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it("shows loading skeleton while session is loading", async () => {
    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={() => {}}
          accountName={null}
          accountEmail={null}
          sessionLoading={true}
          changingPassword={false}
          handleChangePassword={async () => {}}
        />,
      );
      await Promise.resolve();
    });

    // Should not show "Email unavailable" while loading
    expect(container.textContent).not.toContain("Email unavailable");
  });

  it("renders the clarified change-password helper copy", async () => {
    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={() => {}}
          accountName="Roan"
          accountEmail="roan@example.com"
          sessionLoading={false}
          changingPassword={false}
          handleChangePassword={async () => {}}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "Update your email sign-in password. Solace also uses it for encryption after email sign-in.",
    );
  });

  it("shows the clarified success message after a password change", async () => {
    const handleChangePassword = jest.fn<() => Promise<void>>(
      async () => undefined,
    );

    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={() => {}}
          accountName="Roan"
          accountEmail="roan@example.com"
          sessionLoading={false}
          changingPassword={false}
          handleChangePassword={handleChangePassword}
        />,
      );
      await Promise.resolve();
    });

    const openPasswordButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("Change Password"));

    await act(async () => {
      openPasswordButton?.click();
      await Promise.resolve();
    });

    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs).toHaveLength(3);

    await act(async () => {
      setInputValue(inputs[0] as HTMLInputElement, "old-password");
      setInputValue(inputs[1] as HTMLInputElement, "new-password");
      setInputValue(inputs[2] as HTMLInputElement, "new-password");
      await Promise.resolve();
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Update Password"),
    );

    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
    });

    expect(handleChangePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password",
    });
    expect(container.textContent).toContain(
      "Your email sign-in password has been updated. After email sign-in, Solace will also use it to protect your encryption keys.",
    );
  });

  it("shows OAuth-specific account actions and explainer copy", async () => {
    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={() => {}}
          accountName="Roan"
          accountEmail="roan@example.com"
          sessionLoading={false}
          hasPasswordAccount={false}
          hasOAuthAccount={true}
          changingPassword={false}
          handleChangePassword={async () => {}}
          handleSetPassword={async () => {}}
          handleResetEncryptionPassword={async () => {}}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "OAuth and passkey sign-in use a separate encryption password.",
    );
    expect(container.textContent).toContain("Set Email Password");
    expect(container.textContent).toContain("Reset Encryption Password");
    expect(container.textContent).not.toContain("Change Password");
  });

  it("submits the OAuth-only set-password flow with separate explainer copy", async () => {
    const handleSetPassword = jest.fn<() => Promise<void>>(
      async () => undefined,
    );

    await act(async () => {
      root.render(
        <AccountSettings
          goBack={() => {}}
          saving={false}
          handleReset={() => {}}
          deletingAccount={false}
          handleDeleteAccount={() => {}}
          accountName="Roan"
          accountEmail="roan@example.com"
          sessionLoading={false}
          hasPasswordAccount={false}
          hasOAuthAccount={true}
          changingPassword={false}
          handleChangePassword={async () => {}}
          handleSetPassword={handleSetPassword}
          handleResetEncryptionPassword={async () => {}}
        />,
      );
      await Promise.resolve();
    });

    const openSetPasswordButton = Array.from(
      container.querySelectorAll("button"),
    ).find((element) => element.textContent?.includes("Set Email Password"));

    await act(async () => {
      openSetPasswordButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "This gives you an email/password sign-in option without changing the separate encryption password used by OAuth or passkey sign-in.",
    );

    const inputs = Array.from(container.querySelectorAll("input"));
    expect(inputs).toHaveLength(2);

    await act(async () => {
      setInputValue(inputs[0] as HTMLInputElement, "new-password");
      setInputValue(inputs[1] as HTMLInputElement, "new-password");
      await Promise.resolve();
    });

    const submitButton = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Set Password"),
    );

    await act(async () => {
      submitButton?.click();
      await Promise.resolve();
    });

    expect(handleSetPassword).toHaveBeenCalledWith({
      newPassword: "new-password",
    });
    expect(container.textContent).toContain(
      "An email sign-in password has been added to your account. OAuth and passkey sign-in still use your separate encryption password unless you reset it below.",
    );
  });
});
