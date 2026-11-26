/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposeFields } from "./ComposeFields";

jest.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Pressable: ({ children, onPress, accessibilityLabel }: { children?: ReactNode | ((state: { pressed: boolean }) => ReactNode); onPress?: () => void; accessibilityLabel?: string }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {typeof children === "function" ? children({ pressed: false }) : children}
    </button>
  ),
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  TextInput: ({ value, placeholder, accessibilityLabel }: { value?: string; placeholder?: string; accessibilityLabel?: string }) => (
    <input aria-label={accessibilityLabel} value={value} placeholder={placeholder} readOnly />
  ),
  View: ({ children, accessibilityLabel }: { children?: ReactNode; accessibilityLabel?: string }) => <div aria-label={accessibilityLabel}>{children}</div>,
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }),
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  useMailSkin: () => ({ body: { fontSize: 15 }, meta: {}, field: "synthetic", borderPrimary: "synthetic", textTertiary: "synthetic", textSecondary: "synthetic", pressed: "synthetic" }),
}));
jest.mock("./ComposeRecipientField", () => ({
  ComposeRecipientField: ({ label, value, trailing }: { label: string; value: string; trailing?: ReactNode }) => (
    <div>
      <input aria-label={`${label} recipients`} value={value} readOnly />
      {trailing}
    </div>
  ),
}));
jest.mock("./ComposeAttachmentList", () => ({ ComposeAttachmentList: () => null }));

let root: Root;
let container: HTMLDivElement;
const dispatch = jest.fn();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  dispatch.mockClear();
});

afterEach(() => act(() => root.unmount()));

function render(threadReply: boolean, to = "Maya Chen <maya@example.com>, bo@example.com") {
  act(() =>
    root.render(
      <ComposeFields
        to={to}
        cc=""
        bcc=""
        showCcBcc={false}
        dispatch={dispatch}
        mode={threadReply ? "reply" : undefined}
        sourceMessage={null}
        identities={[]}
        composeContext={{ identityId: "i", fromEmail: "sam@solace.onl", fromName: null, draftsMailboxId: "d", sentMailboxId: null }}
        onChooseIdentity={jest.fn()}
        onSelectIdentity={jest.fn()}
        subject="Re: Plans for Friday"
        threadReply={threadReply}
        mailboxLoading={false}
        attachments={[]}
        error={null}
      />,
    ),
  );
}

it("shows a reply's recipients and subject as the thread's own, with Cc and Bcc still open to add", () => {
  render(true);
  expect(container.querySelector('input[aria-label="To recipients"]')).toBeNull();
  expect(container.querySelector('input[aria-label="Subject"]')).toBeNull();
  expect(container.querySelector('[aria-label="To Maya Chen"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="To bo@example.com"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="Subject Re: Plans for Friday"]')?.textContent).toBe("Re: Plans for Friday");

  act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Show Cc, Bcc, and From"]')?.click());
  expect(dispatch).toHaveBeenCalledWith({ type: "toggleCcBcc" });
});

it("gives a new message editable recipients and a subject row", () => {
  render(false, "");
  expect(container.querySelector('input[aria-label="To recipients"]')).not.toBeNull();
  const subject = container.querySelector<HTMLInputElement>('input[aria-label="Subject"]');
  expect(subject?.placeholder).toBe("What’s it about?");
  expect(container.textContent).toContain("Cc");
  expect(container.textContent).toContain("Bcc");
});
