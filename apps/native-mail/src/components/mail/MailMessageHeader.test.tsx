/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MailMessageHeader } from "./MailMessageHeader";
import type { JmapEmailMessage } from "../../lib/mail/types";

type PressableProps = { children?: ReactNode; onPress?: () => void; accessibilityLabel?: string };

jest.mock("react-native", () => ({
  Modal: ({ visible, children }: { visible: boolean; children?: ReactNode }) => (visible ? <div data-testid="modal">{children}</div> : null),
  Pressable: ({ children, onPress, accessibilityLabel }: PressableProps) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {typeof children === "function" ? null : children}
    </button>
  ),
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children, accessibilityLabel }: { children?: ReactNode; accessibilityLabel?: string }) => <div aria-label={accessibilityLabel}>{children}</div>,
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }),
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  MAIL_LAYOUT: { avatarSize: 40, hitSize: 44 },
  useMailSkin: () => ({ meta: {}, field: "synthetic", pressed: "synthetic", textSecondary: "synthetic" }),
}));
jest.mock("@workspace/native-core/components/BlobatarAvatar", () => ({ BlobatarAvatar: () => null }));
jest.mock("@workspace/native-core/components/BottomSheet", () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children?: ReactNode }) => (visible ? <div>{children}</div> : null),
}));
jest.mock("@workspace/native-core/components/sheet/SheetPageStack", () => ({
  useSheetPageStack: (root: string) => ({ page: root, push: jest.fn(), reset: jest.fn() }),
  SheetPageStack: ({ state, renderPage }: { state: { page: string }; renderPage: (page: string) => ReactNode }) => <div>{renderPage(state.page)}</div>,
  SheetSubPage: ({ title, children }: { title: string; children?: ReactNode }) => <section aria-label={title}>{children}</section>,
}));
jest.mock("@workspace/native-core/components/sheet/SheetSections", () => ({
  SheetScroll: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetSection: ({ title, children }: { title?: string; children?: ReactNode }) => <div>{title ? <h3>{title}</h3> : null}{children}</div>,
  SheetGroup: ({ children }: { children?: ReactNode }) => <ul>{children}</ul>,
  SheetItem: ({ label, detail }: { label: string; detail?: string }) => <li>{label}{detail ? ` <${detail}>` : ""}</li>,
  SheetMessage: ({ text }: { text: string }) => <p>{text}</p>,
}));
jest.mock("./RecipientSheet", () => ({
  RecipientSheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useRecipientActions: () => ({ copy: jest.fn(), compose: jest.fn() }),
}));
jest.mock("./MailAuthResultsBadge", () => ({ MailAuthResultsBadge: () => null }));
jest.mock("./MailSimpleLoginRow", () => ({ MailSimpleLoginRow: () => null }));
jest.mock("./MailUnsubscribeRow", () => ({ MailUnsubscribeRow: () => null }));
jest.mock("../../lib/mail/mail-helpers", () => ({
  formatMessageDate: (_date: string, options: { style?: string }) => (options.style === "full" ? "Wed, Nov 26, 2026 at 17:16" : "17:16"),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

const message = {
  id: "m1",
  receivedAt: "2026-11-26T16:16:00Z",
  from: [{ name: "Maya Chen", email: "mchen@solace.onl" }],
  to: [{ email: "sam+shopping@solace.onl" }, { name: "Noor Bakker", email: "noor@kiln.studio" }],
  cc: [{ name: "Bo Jansen", email: "bo@jansen.nl" }],
} as unknown as JmapEmailMessage; // A partial message is enough for the header.

function render() {
  act(() =>
    root.render(
      <MailMessageHeader
        message={message}
        accountEmail="sam@solace.onl"
        accountName="Sam Rivera"
        identities={[]}
        simpleLoginPending={false}
        onSimpleLoginAction={jest.fn()}
        unsubscribePending={false}
        onUnsubscribe={jest.fn()}
        timeFormat="24h"
      />,
    ),
  );
}

it("shows the sender's real address and date, and the plus-tag the mail reached you at", () => {
  render();
  expect(container.textContent).toContain("Maya Chen");
  expect(container.textContent).toContain("mchen@solace.onl · 17:16");
  const tagLine = Array.from(container.querySelectorAll("[aria-label]")).find(
    (node) => node.getAttribute("aria-label") === "Sent to your +shopping address",
  );
  expect(tagLine?.textContent).toBe("to+shopping");
});

it("opens a drawer listing To and Cc, you first, with the full date", () => {
  render();
  const pill = container.querySelector<HTMLButtonElement>('button[aria-label="Recipients: you and 2 others"]');
  expect(pill?.textContent).toBe("3");
  act(() => pill?.click());
  const drawer = container.querySelector('[aria-label="Recipients"]');
  expect(Array.from(drawer?.querySelectorAll("h3") ?? []).map((node) => node.textContent)).toEqual(["To", "Cc"]);
  expect(drawer?.textContent).toContain("Sam Rivera · you <sam+shopping@solace.onl>");
  expect(drawer?.textContent).toContain("Bo Jansen <bo@jansen.nl>");
  expect(drawer?.textContent).toContain("Sent to your +shopping address");
  expect(drawer?.textContent).toContain("Wed, Nov 26, 2026 at 17:16");
});
