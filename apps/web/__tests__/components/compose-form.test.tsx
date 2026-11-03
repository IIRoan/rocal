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

const mockEditorFocus = jest.fn();

jest.mock("../../components/mail/quoted-html", () => ({
  ...jest.requireActual<object>("../../components/mail/quoted-html"),
  serializeEditorContent: () => "",
}));

jest.mock("../../components/mail/rich-text-editor", () => {
  const { useEffect, useRef } = jest.requireActual<typeof import("react")>("react");
  return {
    RichTextEditor: ({
      errorId,
      onEditorReady,
    }: {
      errorId?: string;
      onEditorReady?: (editor: { commands: { focus: typeof mockEditorFocus } }) => void;
    }) => {
      const onEditorReadyRef = useRef(onEditorReady);
      useEffect(() => {
        onEditorReadyRef.current = onEditorReady;
      });
      useEffect(() => {
        onEditorReadyRef.current?.({ commands: { focus: mockEditorFocus } });
      }, []);
      return <div data-testid="editor" aria-describedby={errorId} />;
    },
  };
});

import { ComposeForm } from "../../components/mail/compose-dialog";
import { MailComposeProvider } from "../../components/mail/mail-compose-context";

let container: HTMLDivElement;
let root: Root;
let onSend: jest.Mock<() => Promise<void>>;

function renderForms(autoFocusForm: boolean) {
  const form = (autoFocus: boolean) => (
    <ComposeForm
      identities={[]}
      fallbackFromEmail="me@solace.onl"
      onClose={jest.fn()}
      onSend={onSend}
      isBusy={false}
      autoFocus={autoFocus}
    />
  );
  act(() => {
    root.render(
      <MailComposeProvider
        mailServerLimits={resolveMailServerLimits({})}
        quoteDateOptions={{ timeFormat: "24h" }}
      >
        {form(false)}
        {autoFocusForm ? form(true) : null}
      </MailComposeProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onSend = jest.fn(async () => undefined);
  mockEditorFocus.mockClear();
  renderForms(false);
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

  it("shows the send shortcut the way this platform writes it", () => {
    expect(container.textContent).toContain("Ctrl+↵to send");
  });
});

describe("ComposeForm autoFocus", () => {
  function waitForFrame() {
    return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }

  it("starts a new message in the To field", async () => {
    renderForms(true);
    await waitForFrame();

    const toFields = container.querySelectorAll<HTMLInputElement>('input[placeholder="recipient@example.com"]');
    expect(document.activeElement).toBe(toFields[1]);
    expect(mockEditorFocus).not.toHaveBeenCalled();
  });

  it("starts a reply at the top of the body", async () => {
    type(field("To"), "alice@example.com");
    renderForms(true);
    await waitForFrame();

    expect(mockEditorFocus).toHaveBeenCalledWith("start");
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves the caret alone when a mode switch re-creates the editor", async () => {
    type(field("To"), "alice@example.com");
    renderForms(true);
    await waitForFrame();
    mockEditorFocus.mockClear();

    act(() => button("Plain text").click());
    act(() => button("Plain text").click());
    await waitForFrame();

    expect(mockEditorFocus).not.toHaveBeenCalled();
  });
});
