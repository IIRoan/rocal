/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DraftSaveStatus } from "../../hooks/use-compose-draft-autosave";
import { ComposeFormatBar } from "./ComposeFormatBar";

jest.mock("react-native", () => ({
  Pressable: () => null,
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children, accessibilityLabel, testID }: { children?: ReactNode; accessibilityLabel?: string; testID?: string }) => (
    <div aria-label={accessibilityLabel} data-testid={testID}>{children}</div>
  ),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }),
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  MAIL_LAYOUT: { hitSize: 44 },
  useMailSkin: () => ({ body: { fontSize: 14 }, meta: {}, borderTertiary: "synthetic", textTertiary: "synthetic", pressed: "synthetic" }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

function render(signed: boolean, draftSaveStatus: DraftSaveStatus = "idle") {
  act(() =>
    root.render(
      <ComposeFormatBar
        draftSaveStatus={draftSaveStatus}
        signed={signed}
        onBold={jest.fn()}
        onItalic={jest.fn()}
        onUnderline={jest.fn()}
        onList={jest.fn()}
        onChooseSignature={jest.fn()}
        onInsertTemplate={jest.fn()}
      />,
    ),
  );
  return container.querySelector('[data-testid="compose-signed"]');
}

it("says the message will be signed, for screen readers too, only while signing is on", () => {
  const indicator = render(true);
  expect(indicator?.textContent).toBe("Signed");
  expect(indicator?.getAttribute("aria-label")).toBe(
    "Signed with your key. Mail to people outside Solace carries a PGP signature and your public key. Mail to Solace accounts is always signed inside its encryption.",
  );
  expect(render(false)).toBeNull();
});

it("gives way to the draft save status while it shows", () => {
  expect(render(true, "saving")).toBeNull();
  expect(container.textContent).toContain("Saving…");
});
