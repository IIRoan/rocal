/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, jest } from "@jest/globals";
import { MailTrustReviewDialog } from "@/components/mail/mail-trust-review";
import type { MailTrustProblem } from "@workspace/calendar-core";

jest.mock("lucide-react", () => ({ XIcon: () => null, CheckIcon: () => null }));
jest.mock("@/lib/mail/mail-trust", () => ({
  configureMailTrustQueryClient: jest.fn(),
  mailTrustReviewBridge: {},
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const settle = jest.fn();
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  settle.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
function render(problem: MailTrustProblem) {
  act(() =>
    root.render(<MailTrustReviewDialog problem={problem} settle={settle} />),
  );
}
function button(text: string) {
  const value = [
    ...document.body.querySelectorAll<HTMLButtonElement>("button"),
  ].find((item) => item.textContent === text);
  if (!value) throw new Error(`Missing ${text} button`);
  return value;
}
it("shows both fingerprints and requires explicit replacement approval", () => {
  render({
    kind: "changed",
    email: "synthetic@solace.test",
    oldFingerprint: "A".repeat(40),
    newFingerprint: "B".repeat(40),
  });
  expect(document.body.textContent).toContain("A".repeat(40));
  expect(document.body.textContent).toContain("B".repeat(40));
  expect(document.body.textContent).toContain("separate trusted channel");
  expect(settle).not.toHaveBeenCalled();
  act(() => button("Approve replacement").click());
  expect(settle).toHaveBeenCalledWith("approve");
});
it("does not reset unavailable history without acknowledging the loss of all pins", () => {
  render({ kind: "missing", expectedEncryptedTrust: null, resetAllowed: true });
  act(() => button("Reset key history…").click());
  expect(button("Reset saved key history").disabled).toBe(true);
  expect(document.body.textContent).toContain("every saved correspondent key");
  act(() => button("Reset saved key history").click());
  expect(settle).not.toHaveBeenCalled();
  const checkbox =
    document.body.querySelector<HTMLButtonElement>('[role="checkbox"]');
  if (!checkbox) throw new Error("Reset acknowledgment missing");
  act(() => checkbox.click());
  expect(button("Reset saved key history").disabled).toBe(false);
  act(() => button("Reset saved key history").click());
  expect(settle).toHaveBeenCalledWith("reset");
});
it("offers an update-required state with no reset or approval escape", () => {
  render({
    kind: "update_required",
    expectedEncryptedTrust: "SYNTHETIC-new-version",
  });
  expect(document.body.textContent).toContain("Update Solace");
  expect(document.body.textContent).not.toContain("Reset key history");
  expect(document.body.textContent).not.toContain("Approve replacement");
  act(() => button("Cancel").click());
  expect(settle).toHaveBeenCalledWith("cancel");
});
it("shows capacity failure and keeps retry/cancel visible", () => {
  render({
    kind: "capacity",
    expectedEncryptedTrust: "SYNTHETIC-full-history",
    resetAllowed: true,
  });
  expect(document.body.textContent).toContain("history is full");
  act(() => button("Retry").click());
  expect(settle).toHaveBeenCalledWith("retry");
});

it("requires selection and explicit confirmation before removing only one saved key", () => {
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
  expect(document.body.textContent).toContain("for bob@solace.test");
  act(() => button("Remove selected saved key").click());
  expect(settle).toHaveBeenCalledWith({
    kind: "remove",
    email: "bob@solace.test",
    fingerprint: "B".repeat(40),
  });
});

it("requires both explicit reset steps for an older valid history after a restore", () => {
  render({
    kind: "rollback",
    expectedEncryptedTrust: "mt1.SYNTHETIC-older-valid-history",
    resetAllowed: true,
  });
  expect(document.body.textContent).toContain(
    "older than this device last saw",
  );
  expect(settle).not.toHaveBeenCalled();
  act(() => button("Reset key history…").click());
  expect(button("Reset saved key history").disabled).toBe(true);
  const checkbox =
    document.body.querySelector<HTMLButtonElement>('[role="checkbox"]');
  if (!checkbox) throw new Error("Reset acknowledgment missing");
  act(() => checkbox.click());
  act(() => button("Reset saved key history").click());
  expect(settle).toHaveBeenCalledWith("reset");
});
