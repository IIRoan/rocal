/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposeHeader } from "./ComposeHeader";
import type { DraftSaveStatus } from "../../hooks/use-compose-draft-autosave";

jest.mock("react-native", () => ({
  ActivityIndicator: () => null,
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {typeof children === "function" ? children({ pressed: false }) : children}
    </button>
  ),
  StyleSheet: { create: (styles: object) => styles },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children, testID, accessibilityLabel }: { children?: ReactNode; testID?: string; accessibilityLabel?: string }) => (
    <div data-testid={testID} aria-label={accessibilityLabel}>{children}</div>
  ),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }),
}));
jest.mock("@workspace/native-core/components/mail/mail-ui", () => ({
  MAIL_LAYOUT: { hitSize: 44 },
  useMailSkin: () => ({ title: {} }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

function render(props: {
  scheduledLabel?: string | null;
  onSend?: () => void;
  onClearSchedule?: () => void;
  signed?: boolean;
  draftSaveStatus?: DraftSaveStatus;
}) {
  act(() =>
    root.render(
      <ComposeHeader
        title="New message"
        canSend
        sending={false}
        onClose={jest.fn()}
        onSend={props.onSend ?? jest.fn()}
        scheduledLabel={props.scheduledLabel}
        onClearSchedule={props.onClearSchedule}
        draftSaveStatus={props.draftSaveStatus ?? "idle"}
        signed={props.signed ?? false}
      />,
    ),
  );
}

const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

it("says Send until a time is armed, then Schedule with the time and a way to clear it", () => {
  render({});
  expect(byLabel("Send")).toBeTruthy();
  expect(container.textContent).not.toContain("Scheduled for");

  const onSend = jest.fn();
  const onClearSchedule = jest.fn();
  render({ scheduledLabel: "Nov 27, 08:00", onSend, onClearSchedule });
  expect(byLabel("Send")).toBeNull();
  expect(container.textContent).toContain("Scheduled for Nov 27, 08:00");
  act(() => byLabel("Schedule")?.click());
  expect(onSend).toHaveBeenCalledTimes(1);
  act(() => byLabel("Don't schedule")?.click());
  expect(onClearSchedule).toHaveBeenCalledTimes(1);
});

it("says in the top bar that the message will be signed, for screen readers too, only while signing is on", () => {
  render({ signed: true });
  const indicator = container.querySelector('[data-testid="compose-signed"]');
  expect(indicator?.textContent).toBe("Signed");
  expect(indicator?.getAttribute("aria-label")).toBe(
    "Signed with your key. Mail to people outside Solace carries a PGP signature and your public key. Mail to Solace accounts is always signed inside its encryption.",
  );
  render({ signed: false });
  expect(container.querySelector('[data-testid="compose-signed"]')).toBeNull();
});

it("joins the signed note and the draft save status in one capsule", () => {
  render({ signed: true, draftSaveStatus: "saving" });
  expect(container.querySelector('[data-testid="compose-signed"]')?.textContent).toBe("Signed · Saving…");
  render({ draftSaveStatus: "error" });
  expect(container.textContent).toContain("Save failed");
  render({});
  expect(container.textContent).not.toMatch(/Signed|Sav/);
});

it("announces the compose title as the drawer's heading", () => {
  render({});
  expect(container.textContent).toContain("New message");
});
