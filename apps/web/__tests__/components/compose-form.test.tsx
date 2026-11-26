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
const mockPrepareOutgoingImageFiles = jest.fn(async (files: File[]) =>
  files.map((file) => new File(["clean"], `clean-${file.name}`, { type: file.type })),
);

jest.mock("@/lib/mail/strip-image-metadata", () => ({
  prepareOutgoingImageFiles: (files: File[]) => mockPrepareOutgoingImageFiles(files),
}));

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
import { getMailComposeBridge } from "../../components/mail/mail-compose-bridge";
import { MailComposeProvider, useMailComposeChrome } from "../../components/mail/mail-compose-context";
import type { ComposeScheduling } from "../../components/mail/compose-schedule-popover";
import type { JmapIdentity } from "@/lib/mail/types";

let container: HTMLDivElement;
let root: Root;
type SendOptions = { skipAttachmentCheck?: boolean; sendAt?: string };
let onSend: jest.Mock<(options?: SendOptions) => Promise<void>>;

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
  onSend = jest.fn(async (_options?: SendOptions) => undefined);
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

  it("attaches picked photos only after removing their metadata", async () => {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Attach files"]');
    if (!input) throw new Error("No attach input");
    const photo = new File(["exif"], "trip.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [photo], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mockPrepareOutgoingImageFiles).toHaveBeenCalledWith([photo]);
    expect(container.textContent).toContain("clean-trip.jpg");
    expect(container.textContent).not.toContain("Remove trip.jpg");
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

describe("ComposeForm signatures, signing and scheduling", () => {
  const identities: JmapIdentity[] = [
    { id: "work", email: "alex@solace.onl", name: "Alex", textSignature: "Alex Doe\nSolace" },
    { id: "home", email: "alex@home.test", name: "Alex", textSignature: "Alex" },
  ];
  const scheduling: ComposeScheduling = {
    maxDelayedSendSeconds: 7 * 86_400,
    internalDomain: "solace.onl",
    timezone: "Europe/Amsterdam",
    timeFormat: "24h",
    weekStartsOn: 1,
  };

  function OpenCompose() {
    const { isComposeOpen } = useMailComposeChrome();
    return isComposeOpen ? (
      <ComposeForm
        identities={identities}
        fallbackFromEmail="alex@solace.onl"
        onClose={jest.fn()}
        onSend={onSend}
        isBusy={false}
        scheduling={scheduling}
      />
    ) : null;
  }

  function openNewCompose(settings: object) {
    localStorage.setItem("mail:composeSettings", JSON.stringify({ plainTextMode: true, ...settings }));
    // A fresh tree reads the settings just stored.
    act(() => root.render(null));
    act(() =>
      root.render(
        <MailComposeProvider
          identities={identities}
          mailServerLimits={resolveMailServerLimits({})}
          quoteDateOptions={{ timeFormat: "24h" }}
        >
          <OpenCompose />
        </MailComposeProvider>,
      ),
    );
    act(() => getMailComposeBridge()?.openNewCompose());
    const body = container.querySelector("textarea");
    if (!body) throw new Error("No plain-text body");
    return body;
  }

  function edit(body: HTMLTextAreaElement, value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    act(() => {
      setValue?.call(body, value);
      body.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function chooseFrom(identityId: string) {
    const from = container.querySelector("select");
    if (!from) throw new Error("No From picker");
    act(() => {
      from.value = identityId;
      from.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  afterEach(() => localStorage.removeItem("mail:composeSettings"));

  it("opens a new message with the signature below an empty writing line and the caret at the top", () => {
    const body = openNewCompose({});
    expect(body.value).toBe("\n\n-- \nAlex Doe\nSolace");
    expect([body.selectionStart, body.selectionEnd]).toEqual([0, 0]);
  });

  it("swaps an unchanged signature for the new sender's and leaves an edited one alone", () => {
    const body = openNewCompose({});
    chooseFrom("home");
    expect(body.value).toBe("\n\n-- \nAlex");
    edit(body, "Hi\n\n-- \nAlex, edited");
    chooseFrom("work");
    expect(body.value).toBe("Hi\n\n-- \nAlex, edited");
  });

  it("removes the signature with No signature, adds it back from the picker and sends what is written", async () => {
    const body = openNewCompose({});
    const signaturePicker = container.querySelector<HTMLButtonElement>('button[aria-label="Signature"]');
    if (!signaturePicker) throw new Error("No signature picker");
    act(() => signaturePicker.click());
    act(() => button("No signature").click());
    expect(body.value).toBe("\n\n");
    act(() => signaturePicker.click());
    act(() => button("Account signatureAlex Doe Solace").click());
    expect(body.value).toBe("\n\n-- \nAlex Doe\nSolace");
    edit(body, "Hello");
    expect(getMailComposeBridge()?.getDraft().body).toBe("Hello");
  });

  it("shows that the message is signed only while signing is on", () => {
    openNewCompose({ signOutgoingMail: true });
    expect(container.textContent).toContain("Signed with your key");
    expect(container.textContent).toContain("Mail to Solace accounts is always signed inside its encryption.");
    openNewCompose({ signOutgoingMail: false });
    expect(container.textContent).not.toContain("Signed with your key");
  });

  it("only arms Schedule when a time is picked, and schedules when Schedule is pressed", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (media: string) => ({
        matches: false,
        media,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: () => false,
      }),
    });
    const body = openNewCompose({});
    type(field("To"), "sam@solace.onl");
    type(field("Subject"), "Plan");
    edit(body, "See you then");
    act(() => (container.querySelector('button[aria-label="Schedule send"]') as HTMLButtonElement).click());
    const preset = Array.from(document.body.querySelectorAll("button")).find((item) =>
      item.querySelector("span.tabular-nums"),
    );
    act(() => preset?.click());

    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('button[aria-label^="Scheduled for "]')).toBeTruthy();
    await act(async () => button("Schedule").click());
    expect(onSend).toHaveBeenCalledWith({ skipAttachmentCheck: false, sendAt: expect.any(String) });
  });

  it("keeps Schedule send with the other compose tools, not beside Send", () => {
    openNewCompose({});
    const schedule = container.querySelector('button[aria-label="Schedule send"]');
    const attach = container.querySelector('button[aria-label="Attach files"]');
    expect(schedule?.parentElement).toBe(attach?.parentElement);
    expect(schedule?.parentElement?.contains(button("Send"))).toBe(false);
  });
});
