/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { RECOVERY_KEY_TYPO_MESSAGE } from "@workspace/calendar-client";
import {
  FORGOT_PASSWORD_NOTICE,
  RECOVERY_KIT_USED_NOTICE,
} from "@workspace/calendar-core/product-info";
import { authClient } from "@/lib/auth-client";
import { e2eeModule } from "@/lib/e2ee-crypto";
import { toast } from "@workspace/ui/lib/toast";
import { RecoverAccountDialog } from "@/app/login/recover-account-dialog";

jest.mock("lucide-react", () => ({ XIcon: () => null }));

jest.mock("@workspace/ui/lib/toast", () => ({ toast: jest.fn() }));

jest.mock("@/lib/e2ee-crypto", () => {
  const { pbkdf2Sync } = jest.requireActual<typeof import("node:crypto")>("node:crypto");
  const { createE2eeModule } = jest.requireActual<typeof import("@workspace/e2ee")>("@workspace/e2ee");
  return {
    // The provider shape matches Node's WebCrypto at runtime; only the DOM declarations differ.
    e2eeModule: createE2eeModule(globalThis.crypto as never, {
      argon2id: async (password: Uint8Array, salt: Uint8Array) =>
        new Uint8Array(pbkdf2Sync(password, salt, 1, 32, "sha256")),
    }),
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = jest.fn<(path: string, options: { body: Record<string, unknown> }) => Promise<unknown>>();
(authClient as unknown as { $fetch: typeof fetchMock }).$fetch = fetchMock;

let container: HTMLDivElement;
let root: Root;
const onRecovered = jest.fn();

beforeEach(async () => {
  // Radix's Switch measures itself; jsdom has no ResizeObserver.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  fetchMock.mockReset();
  onRecovered.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <RecoverAccountDialog
        open
        onOpenChange={jest.fn()}
        initialEmail="a@solace.test"
        onRecovered={onRecovered}
      />,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function inputs() {
  return Array.from(document.querySelectorAll<HTMLInputElement>("[role='dialog'] input"));
}

async function fill(values: string[]) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    inputs().forEach((input, index) => {
      setValue?.call(input, values[index] ?? input.value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

async function submit() {
  await act(async () => {
    document
      .querySelector("[role='dialog'] form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

/** Waits for the async submit (WebCrypto runs off the microtask queue) to settle into an error or a callback. */
async function settled() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (document.querySelector("[role='alert']")?.textContent || onRecovered.mock.calls.length) {
      return;
    }
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

it("prefills the email, keeps passkeys by default and names the support route", () => {
  expect(inputs()[0]?.value).toBe("a@solace.test");
  expect(document.querySelector("[role='switch']")?.getAttribute("aria-checked")).toBe("false");
  expect(document.body.textContent).toContain(FORGOT_PASSWORD_NOTICE);
});

it("removes passkeys by default when opened from the lost-passkey link", async () => {
  await act(async () =>
    root.render(
      <RecoverAccountDialog
        key="lost-passkey"
        open
        onOpenChange={jest.fn()}
        initialEmail="a@solace.test"
        lostPasskey
        onRecovered={onRecovered}
      />,
    ),
  );
  expect(document.querySelector("[role='switch']")?.getAttribute("aria-checked")).toBe("true");
});

it("refuses a mistyped recovery key before anything is sent", async () => {
  const { recoveryKey } = await e2eeModule.generateRecoveryKey();
  const typo = `${recoveryKey.charAt(0) === "A" ? "B" : "A"}${recoveryKey.slice(1)}`;
  await fill(["a@solace.test", typo, "new-secret-pw", "new-secret-pw"]);
  await submit();
  await settled();

  expect(document.querySelector("[role='alert']")?.textContent).toBe(RECOVERY_KEY_TYPO_MESSAGE);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(onRecovered).not.toHaveBeenCalled();
});

it("resets with the kit, then signs in with the new password", async () => {
  const { secret, recoveryKey } = await e2eeModule.generateRecoveryKey();
  const envelope = await e2eeModule.createRecoveryEnvelope(
    await e2eeModule.generateAccountKey(),
    await e2eeModule.generateBlindIndexKey(),
    secret,
  );
  fetchMock.mockImplementation(async (path) =>
    path === "/recovery/start"
      ? { data: envelope, error: null }
      : { data: { status: true }, error: null },
  );
  await fill(["a@solace.test", recoveryKey, "new-secret-pw", "new-secret-pw"]);
  await submit();
  await settled();

  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/recovery/start",
    "/recovery/complete",
  ]);
  expect(fetchMock.mock.calls[1]?.[1].body).toMatchObject({ removePasskeys: false });
  expect(toast).toHaveBeenCalledWith(RECOVERY_KIT_USED_NOTICE);
  expect(onRecovered).toHaveBeenCalledWith("a@solace.test", "new-secret-pw");
});

it("asks for matching passwords", async () => {
  await fill(["a@solace.test", "ABCD", "new-secret-pw", "other-pw"]);
  await submit();

  expect(document.querySelector("[role='alert']")?.textContent).toBe(
    "New password and confirmation must match.",
  );
});
