/** @jest-environment jsdom */
import React, { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, jest } from "@jest/globals";
import { MailSecurityBadge } from "@/components/mail/message-reader/mail-security-badge";

jest.mock("lucide-react", () => ({
  ShieldCheck: () => null,
  ShieldAlert: () => null,
  Lock: () => null,
  Info: () => null,
}));

const mockReview = jest
  .fn<(email: string) => Promise<void>>()
  .mockResolvedValue();
jest.mock("@workspace/calendar-core", () => ({
  ...jest.requireActual<typeof import("@workspace/calendar-core")>(
    "@workspace/calendar-core",
  ),
  MAIL_KEY_CONTINUITY_ENABLED: true,
}));
jest.mock("@/lib/mail/mail-trust", () => ({
  reviewMailSenderKey: (...args: Parameters<typeof mockReview>) =>
    mockReview(...args),
}));
jest.mock("@workspace/ui/solace", () => ({
  DropdownPanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it.each([
  ["plain", false],
  ["plain", true],
  ["inline_pgp", true],
  ["pgp_mime", true],
  ["internal_e2ee", true],
] as const)("hides routine %s status with mailbox encryption=%s", (messageState, accountEncryptedAtRest) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <MailSecurityBadge
        messageState={messageState}
        accountEncryptedAtRest={accountEncryptedAtRest}
        readState="decrypted"
        signatureVerificationState="not_signed"
      />,
    ),
  );
  expect(container.innerHTML).toBe("");
  act(() => root.unmount());
});

it.each([
  ["inline_pgp", "failed", "not_signed", "Decryption failed"],
  ["inline_pgp", "decrypted", "failed", "PGP encrypted, signature check failed"],
  ["unknown_encrypted", "decrypted", "not_signed", "Encryption unconfirmed"],
] as const)("keeps %s warnings visible: %s / %s", (messageState, readState, signatureVerificationState, label) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <MailSecurityBadge
        messageState={messageState}
        accountEncryptedAtRest
        readState={readState}
        signatureVerificationState={signatureVerificationState}
      />,
    ),
  );
  expect(container.textContent).toContain(label);
  act(() => root.unmount());
});

it("opens explicit changed-sender review from the reader notice and does not claim a failed signature matches the old key", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() =>
    root.render(
      <MailSecurityBadge
        messageState="inline_pgp"
        accountEncryptedAtRest
        readState="decrypted"
        signatureVerificationState="failed"
        senderKeyTrustState={{
          kind: "key_changed",
          oldFingerprint: "A".repeat(40),
          newFingerprint: "B".repeat(40),
        }}
        senderEmail="alice@solace.test"
      />,
    ),
  );
  expect(container.textContent).toContain("Signature does not match saved key");
  expect(mockReview).not.toHaveBeenCalled();
  const button = container.querySelector("button");
  if (!button) throw new Error("Sender review action missing");
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  expect(mockReview).toHaveBeenCalledWith("alice@solace.test");
  expect(container.textContent).toContain("Reopen this message");
  act(() => root.unmount());
});

it.each([
  {
    readState: "decrypted" as const,
    expected: "",
  },
  { readState: "read_limit" as const, expected: "Reading limit reached" },
  { readState: "pending" as const, expected: "" },
])(
  "renders the MIME reading outcome: $readState",
  ({ readState, expected }) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() =>
      root.render(
        <MailSecurityBadge
          messageState="pgp_mime"
          accountEncryptedAtRest
          readState={readState}
        />,
      ),
    );
    if (expected) expect(container.textContent).toContain(expected);
    else expect(container.innerHTML).toBe("");
    expect(container.textContent).not.toMatch(/\bmay\b/i);
    expect(container.textContent).not.toContain("Decryption failed");
    act(() => root.unmount());
  },
);
