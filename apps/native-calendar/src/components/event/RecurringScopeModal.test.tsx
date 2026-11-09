/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { nativeLightTheme } from "@workspace/design-tokens";
import { RecurringScopeModal } from "./RecurringScopeModal";
import { createEventSheetStyles } from "./event-sheet-styles";

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  Modal: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
  View: ({
    children,
    accessibilityViewIsModal,
  }: {
    children: ReactNode;
    accessibilityViewIsModal?: boolean;
  }) => <div data-modal={accessibilityViewIsModal}>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Pressable: ({
    accessible,
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessible?: boolean;
    accessibilityLabel?: string;
    children: ReactNode;
    onPress: () => void;
  }) => (
    <div
      data-pressable="true"
      data-accessible={accessible !== false}
      aria-label={accessibilityLabel}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      {children}
    </div>
  ),
}));

test("recurrence choices remain separate accessibility targets inside the modal", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  const select = jest.fn();
  const close = jest.fn();
  try {
    act(() =>
      root.render(
        <RecurringScopeModal
          action="edit"
          visible
          styles={createEventSheetStyles(nativeLightTheme)}
          onSelect={select}
          onClose={close}
        />,
      ),
    );
    const option = container.querySelector<HTMLDivElement>(
      '[aria-label="All occurrences"]',
    );
    expect(option).not.toBeNull();
    expect(
      option?.parentElement?.closest(
        '[data-pressable="true"][data-accessible="true"]',
      ),
    ).toBeNull();
    expect(container.querySelector('[data-modal="true"]')).not.toBeNull();
    act(() => option?.click());
    expect(select).toHaveBeenCalledWith("all");
    expect(close).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});
