/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createRoot, type Root } from "react-dom/client";
import { resolveMailServerLimits } from "@workspace/calendar-core";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { error: jest.fn() }),
}));

jest.mock("lucide-react", () => new Proxy({}, { get: () => () => null }));

jest.mock("@workspace/ui/hooks", () => ({
  ...jest.requireActual<object>("@workspace/ui/hooks"),
  useIsMobile: () => false,
}));

jest.mock("@/hooks/use-compose-quoted-inline-images", () => ({
  useComposeQuotedInlineImages: () => undefined,
}));

jest.mock("@/hooks/use-recent-contacts", () => ({
  useRecentContacts: () => ({
    payload: { version: 1, contacts: [] },
    isAvailable: false,
    isLoading: false,
  }),
}));

jest.mock("../../components/mail/rich-text-editor", () => ({
  RichTextEditor: ({ errorId }: { errorId?: string }) => (
    <div data-testid="editor" aria-describedby={errorId} />
  ),
}));

import { ComposeForm } from "../../components/mail/compose-dialog";
import { MailComposeProvider } from "../../components/mail/mail-compose-context";

let container: HTMLDivElement;
let root: Root;
let onSend: jest.Mock<() => Promise<void>>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onSend = jest.fn(async () => undefined);
  act(() => {
    root.render(
      <MailComposeProvider
        mailServerLimits={resolveMailServerLimits({})}
        quoteDateOptions={{ timeFormat: "24h" }}
      >
        <ComposeForm
          identities={[]}
          fallbackFromEmail="me@solace.onl"
          onClose={jest.fn()}
          onSend={onSend}
          isBusy={false}
        />
      </MailComposeProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(name: string) {
  const match = Array.from(document.body.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === name,
  );
  if (!match) throw new Error(`No button named ${name}`);
  return match;
}

function field(label: string) {
  const labelElement = Array.from(container.querySelectorAll("label")).find(
    (element) => element.textContent === label,
  );
  const control = labelElement?.htmlFor
    ? document.getElementById(labelElement.htmlFor)
    : null;
  if (!(control instanceof HTMLInputElement)) throw new Error(`No field labelled ${label}`);
  return control;
}

function describedBy(element: HTMLElement) {
  return document.getElementById(element.getAttribute("aria-describedby") ?? "");
}

function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ComposeForm", () => {
  it("keeps Send enabled and, on an incomplete send, shows each error in its field's row and focuses the first", () => {
    const send = button("Send");
    expect(send.disabled).toBe(false);

    act(() => send.click());

    expect(onSend).not.toHaveBeenCalled();
    const to = field("To");
    expect(document.activeElement).toBe(to);
    expect(to.getAttribute("aria-invalid")).toBe("true");
    const toError = describedBy(to);
    expect(toError?.textContent).toBe("Enter at least one recipient email address.");
    expect(toError?.parentElement?.contains(to)).toBe(true);
    expect(container.textContent).not.toContain("BCC");

    const subject = field("Subject");
    const subjectError = describedBy(subject);
    expect(subjectError?.textContent).toBe("Enter a subject line.");
    expect(subjectError?.parentElement?.contains(subject)).toBe(true);

    const editor = container.querySelector<HTMLElement>('[data-testid="editor"]');
    expect(editor && describedBy(editor)?.textContent).toBe("Write a message or attach a file.");

    type(to, "alice@example.com");
    expect(to.hasAttribute("aria-invalid")).toBe(false);
    expect(button("BCC")).toBeTruthy();
  });

  it("asks before Clear discards typed content", () => {
    const subject = field("Subject");
    type(subject, "Quarterly report");

    act(() => button("Clear").click());
    expect(document.body.textContent).toContain("Clear this message?");
    expect(subject.value).toBe("Quarterly report");

    act(() => button("Clear message").click());
    expect(field("Subject").value).toBe("");
  });
});
