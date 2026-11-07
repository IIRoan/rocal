/** @jest-environment jsdom */

import React, { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { SheetItem } from "./SheetSections";

jest.mock("react-native", () => ({
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    onPress: () => void;
    accessibilityLabel: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));
jest.mock("@expo/vector-icons", () => ({ Feather: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
jest.mock("../../providers/ThemeProvider", () => ({
  useTheme: () => ({
    theme: jest.requireActual<typeof import("@workspace/design-tokens")>(
      "@workspace/design-tokens",
    ).nativeLightTheme,
  }),
}));
jest.mock("../BottomSheet", () => ({ BottomSheetScrollView: () => null }));
jest.mock("../ui/Switch", () => ({ Switch: () => null }));
jest.mock("../mail/mail-ui", () => ({
  MAIL_ICON: { sheet: 20, sheetAccessory: 16 },
  useMailSkin: () => ({}),
}));

test("a leading action remains outside the row's accessible button and acts independently", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  const open = jest.fn();
  const toggle = jest.fn();
  try {
    act(() =>
      root.render(
        <SheetItem
          label="Calendar"
          onPress={open}
          leadingAction={
            <button
              role="checkbox"
              aria-checked="true"
              aria-label="Show Calendar"
              onClick={toggle}
            >
              Visible
            </button>
          }
        />,
      ),
    );
    const checkbox =
      container.querySelector<HTMLButtonElement>('[role="checkbox"]');
    const row = container.querySelector<HTMLButtonElement>(
      '[aria-label="Calendar"]',
    );
    expect(checkbox).not.toBeNull();
    expect(row).not.toBeNull();
    expect(row?.contains(checkbox)).toBe(false);
    act(() => checkbox?.click());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    act(() => row?.click());
    expect(open).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount());
  }
});
