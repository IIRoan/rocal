/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ComposeHeader } from "./ComposeHeader";

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
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("@workspace/native-core/providers/ThemeProvider", () => ({
  useTheme: () => ({ theme: jest.requireActual<typeof import("@workspace/design-tokens")>("@workspace/design-tokens").nativeMailLightTheme }),
}));
jest.mock("@workspace/native-core/lib/app-layout", () => ({ LAYOUT_ICON: { close: 20, action: 20 } }));
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

function render(props: { scheduledLabel?: string | null; onSend?: () => void; onClearSchedule?: () => void }) {
  act(() =>
    root.render(
      <ComposeHeader
        title="New message"
        canSend
        sending={false}
        onClose={jest.fn()}
        onAttach={jest.fn()}
        onSend={props.onSend ?? jest.fn()}
        onSchedule={jest.fn()}
        scheduledLabel={props.scheduledLabel}
        onClearSchedule={props.onClearSchedule}
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
