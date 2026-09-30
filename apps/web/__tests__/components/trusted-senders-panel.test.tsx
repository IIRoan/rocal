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
import { MailDisplaySettingsPanel } from "@/components/mail/mail-display-settings-panel";
import { TrustedSendersPanel } from "@/components/mail/trusted-senders-panel";
import { readMailDisplaySettings } from "@/lib/mail/mail-display-settings";

jest.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    Image: Icon,
    Paperclip: Icon,
    ShieldCheck: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    ChevronDownIcon: Icon,
    ChevronUpIcon: Icon,
    CheckIcon: Icon,
    Loader2: Icon,
  };
});

jest.mock("@/hooks/use-recent-contacts", () => ({
  useRecentContacts: () => ({ payload: { contacts: [] } }),
}));

jest.mock("@/lib/mail/schedule-mail-settings-sync", () => ({
  scheduleMailSettingsServerSync: jest.fn(),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function findButton(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (entry) => entry.textContent?.includes(text),
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

describe("trusted senders submenu", () => {
  it("opens trusted senders through palette navigation", () => {
    const onOpenTrustedSenders = jest.fn();
    act(() =>
      root.render(
        <MailDisplaySettingsPanel
          goBack={jest.fn()}
          onOpenTrustedSenders={onOpenTrustedSenders}
        />,
      ),
    );
    act(() => findButton("Trusted senders").click());
    expect(onOpenTrustedSenders).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("adds and removes a trusted sender through the submenu form", async () => {
    act(() => root.render(<TrustedSendersPanel />));
    const input = container.querySelector("input");
    if (!input) throw new Error("Missing sender input");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(input, "Sender@Example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => findButton("Add").click());
    expect(readMailDisplaySettings().trustedSenders).toEqual([
      "sender@example.com",
    ]);
    expect(container.textContent).toContain("sender@example.com");
    expect(input.value).toBe("");
    act(() => findButton("Remove").click());
    expect(readMailDisplaySettings().trustedSenders).toEqual([]);
    expect(container.textContent).toContain("No trusted senders yet.");
  });
});
